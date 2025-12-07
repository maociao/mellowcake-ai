import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';
import { characterService } from '@/services/character-service';
import { personaService } from '@/services/persona-service';
import { llmService } from '@/services/llm-service';
import { contextManager } from '@/lib/context-manager';
import { memoryService } from '@/services/memory-service';
import { lorebookService } from '@/services/lorebook-service';
import { trimResponse } from '@/lib/text-utils';

import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messageId } = body;

        if (!messageId) {
            return new NextResponse('Missing messageId', { status: 400 });
        }

        // 1. Get the target message to find session
        const targetMsg = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).get();
        if (!targetMsg) return new NextResponse('Message not found', { status: 404 });

        const sessionId = targetMsg.sessionId;

        // 2. Get Session & Details
        const session = await chatService.getSessionById(sessionId);
        if (!session) return new NextResponse('Session not found', { status: 404 });

        const character = await characterService.getById(session.characterId);
        if (!character) return new NextResponse('Character not found', { status: 404 });

        let persona = null;
        if (session.personaId) {
            persona = await personaService.getById(session.personaId);
        }

        // 3. Get History UP TO the target message (exclusive)
        // We need to find the index of the target message in the full history
        const allMessages = await chatService.getMessages(sessionId);
        const targetIndex = allMessages.findIndex(m => m.id === messageId);

        if (targetIndex === -1) return new NextResponse('Message not in history', { status: 500 });

        // History for context is everything before the target message
        const history = allMessages.slice(0, targetIndex);

        // The "triggering" content is the last user message in this history
        // (Usually the one right before, but let's be safe)
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
        const content = lastUserMsg ? lastUserMsg.content : '';

        console.log(`[Regenerate API] Regenerating message ${messageId}. Context history length: ${history.length}`);

        // 4. Build Context (Same logic as chat route)
        console.log(`[Regenerate API] Searching memories for character ${character.id} with query: "${content}"`);
        const memories = await memoryService.searchMemories(character.id, content);

        // Scan Lorebooks
        let lorebookContent: { content: string; createdAt: string }[] = [];
        const lorebooks = session.lorebooks ? JSON.parse(session.lorebooks) : (character.lorebooks ? JSON.parse(character.lorebooks) : []);

        if (lorebooks && lorebooks.length > 0) {
            const recentHistory = history.slice(-5).map(m => m.content).join('\n');
            const scanText = `${recentHistory}\n${content}`;
            lorebookContent = await lorebookService.scan(scanText, lorebooks);
        }

        // Build Prompt
        const { prompt: rawPrompt, breakdown } = contextManager.buildLlama3Prompt(character, persona, history, memories, lorebookContent, session.summary);

        // 5. Call LLM
        // 5. Call LLM
        // Use default model or try to find what was used? Let's use default/stheno preference
        const models = await llmService.getModels();
        const selectedModel = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

        // Get model info for context size
        const modelInfo = await llmService.getModelInfo(selectedModel);
        const contextLimit = 8192; // Default

        const promptUsed = JSON.stringify({
            prompt: rawPrompt,
            breakdown,
            model: selectedModel,
            contextLimit
        });

        console.log(`[Regenerate API] Calling LLM generate with model: ${selectedModel}`);
        let responseContent = await llmService.generate(selectedModel, rawPrompt, {
            stop: ['<|eot_id|>', `${persona?.name || 'User'}:`],
            temperature: 1.12,
            num_predict: 200
        });

        // Strip character name prefix
        const prefix = `${character.name}:`;
        if (responseContent.trim().startsWith(prefix)) {
            responseContent = responseContent.trim().substring(prefix.length).trim();
        } else if (responseContent.trim().startsWith(`${character.name}: `)) {
            responseContent = responseContent.trim().substring(`${character.name}: `.length).trim();
        }

        // Trim response
        responseContent = trimResponse(responseContent);

        // 6. Add as Swipe
        console.log(`[Regenerate API] Adding swipe to message ${messageId}`);
        const updatedMessages = await chatService.addSwipe(messageId, responseContent, promptUsed);

        if (!updatedMessages) {
            return new NextResponse('Failed to update message', { status: 500 });
        }

        const [updatedMessage] = updatedMessages;
        return NextResponse.json(updatedMessage);

    } catch (error) {
        console.error('[Regenerate API] Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
