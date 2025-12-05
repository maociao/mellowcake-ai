import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';
import { characterService } from '@/services/character-service';
import { personaService } from '@/services/persona-service';
import { llmService } from '@/services/llm-service';
import { contextManager } from '@/lib/context-manager';
import { memoryService } from '@/services/memory-service';
import { lorebookService } from '@/services/lorebook-service';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, personaId } = body;

        if (!sessionId) {
            return new NextResponse('Missing sessionId', { status: 400 });
        }

        // 1. Get Session & Details
        const session = await chatService.getSessionById(sessionId);
        if (!session) return new NextResponse('Session not found', { status: 404 });

        const character = await characterService.getById(session.characterId);
        if (!character) return new NextResponse('Character not found', { status: 404 });

        let persona = null;
        const activePersonaId = personaId || session.personaId;
        if (activePersonaId) {
            persona = await personaService.getById(activePersonaId);
        }

        // 2. Get History
        const history = await chatService.getMessages(sessionId);

        // 3. Build Context (Impersonation)
        // We can use the last few messages for context search if we want, 
        // but for impersonation, maybe just the immediate context is enough?
        // Let's do a quick memory search based on the last message from the character to give context.
        const lastMessage = history[history.length - 1];
        const query = lastMessage ? lastMessage.content : '';

        const memories = await memoryService.searchMemories(character.id, query);

        // Scan Lorebooks (using last 3 messages)
        let lorebookContent: { content: string; createdAt: string }[] = [];
        if (session.lorebooks) {
            const lorebookNames = JSON.parse(session.lorebooks) as string[];
            if (lorebookNames.length > 0) {
                const recentHistory = history.slice(-3).map(m => m.content).join('\n');
                const scanText = `${recentHistory}\n${query}`; // Include query/last message
                lorebookContent = await lorebookService.scan(scanText, lorebookNames);
            }
        } else if (character.lorebooks) {
            // Fallback to character default lorebooks if session ones aren't set (though UI usually sets them)
            const lorebookNames = JSON.parse(character.lorebooks) as string[];
            if (lorebookNames.length > 0) {
                const recentHistory = history.slice(-3).map(m => m.content).join('\n');
                const scanText = `${recentHistory}\n${query}`;
                lorebookContent = await lorebookService.scan(scanText, lorebookNames);
            }
        }

        // Build Prompt
        const { prompt } = contextManager.buildImpersonationPrompt(
            character,
            persona,
            history,
            memories,
            lorebookContent,
            session.summary
        );

        // 4. Call LLM
        const models = await llmService.getModels();
        // Use stheno or default
        const model = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

        console.log(`[Impersonate API] Generating response for persona ${persona?.name || 'User'}...`);

        const responseContent = await llmService.generate(model, prompt, {
            stop: ['<|eot_id|>', `${character.name}:`] // Stop if it tries to generate character response
        });

        // Clean up response
        let cleaned = responseContent.trim();
        const prefix = `${persona?.name || 'User'}:`;
        if (cleaned.startsWith(prefix)) {
            cleaned = cleaned.substring(prefix.length).trim();
        }

        return NextResponse.json({ content: cleaned });

    } catch (error) {
        console.error('[Impersonate API] Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
