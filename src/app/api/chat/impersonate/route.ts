import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';
import { characterService } from '@/services/character-service';
import { personaService } from '@/services/persona-service';
import { llmService } from '@/services/llm-service';
import { contextManager } from '@/lib/context-manager';
import { memoryService } from '@/services/memory-service';
import { lorebookService } from '@/services/lorebook-service';
import { trimResponse } from '@/lib/text-utils';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, personaId, options, trimLength } = body;

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

        // If persona is linked to a DIFFERENT character, fetch their memories too
        let linkedCharacter = null;
        if (persona && (persona as any).characterId) {
            // Fetch the actual linked character object
            if ((persona as any).characterId !== character.id) {
                console.log(`[Impersonate API] Fetching linked character ${(persona as any).characterId}`);
                linkedCharacter = await characterService.getById((persona as any).characterId);

                if (linkedCharacter) {
                    const linkedMemories = await memoryService.searchMemories(linkedCharacter.id, query);
                    if (linkedMemories.length > 0) {
                        console.log(`[Impersonate API] Found ${linkedMemories.length} linked memories`);
                        memories.push(...linkedMemories);
                    }
                }
            } else {
                // Linked to SAME character (unlikely but possible)
                linkedCharacter = character;
            }

            // Re-sort memories
            if (memories.length > 0) {
                memories.sort((a: any, b: any) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
                if (memories.length > 10) memories.length = 10;
            }
        }

        // Scan Lorebooks (using last 3 messages)
        // Scan Lorebooks (using last 3 messages)
        let lorebookContent: { content: string; createdAt: string }[] = [];
        const lorebookNames = session.lorebooks
            ? JSON.parse(session.lorebooks) as string[]
            : (character.lorebooks ? JSON.parse(character.lorebooks) as string[] : []);

        if (lorebookNames.length > 0) {
            // 1. Get Always Included Entries
            const alwaysIncluded = await lorebookService.getAlwaysIncluded(lorebookNames);

            // 2. Scan for Dynamic Entries
            const recentHistory = history.slice(-3).map(m => m.content).join('\n');
            const scanText = `${recentHistory}\n${query}`;
            const scannedEntries = await lorebookService.scan(scanText, lorebookNames);

            lorebookContent = [...alwaysIncluded, ...scannedEntries];
        }

        // Build Prompt
        const { prompt } = contextManager.buildImpersonationPrompt(
            character,
            persona,
            history,
            memories,
            lorebookContent,
            session.summary,
            linkedCharacter,
            (session as any).responseStyle
        );

        // 4. Call LLM
        const models = await llmService.getModels();
        // Use stheno or default
        const model = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

        console.log(`[Impersonate API] Generating response for persona ${persona?.name || 'User'}...`);

        // Calculate effective temperature based on style
        let effectiveOptions = { ...options };
        // Impersonate is arguably always "User" role, but responseStyle dictates the tone.
        // User didn't specify if impersonation follows the same rule, but typically "Shortform" mode implies the whole chat is in that mode?
        // Let's apply it for consistency.
        if ((session as any).responseStyle === 'short' && (session as any).shortTemperature != null) {
            effectiveOptions.temperature = (session as any).shortTemperature;
        } else if ((session as any).responseStyle === 'long' && (session as any).longTemperature != null) {
            effectiveOptions.temperature = (session as any).longTemperature;
        }

        const responseContent = await llmService.generate(model, prompt, {
            stop: ['<|eot_id|>', `${character.name}:`], // Stop if it tries to generate character response
            ...effectiveOptions
        });

        // Clean up response
        let cleaned = responseContent.trim();
        const prefix = `${persona?.name || 'User'}:`;
        if (cleaned.startsWith(prefix)) {
            cleaned = cleaned.substring(prefix.length).trim();
        }

        // Trim response
        cleaned = trimResponse(cleaned, trimLength || 800);

        return NextResponse.json({ content: cleaned });

    } catch (error) {
        console.error('[Impersonate API] Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
