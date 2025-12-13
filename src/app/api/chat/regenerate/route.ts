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
        const { messageId, options, trimLength } = body;

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

        // Linked Character Logic
        let linkedCharacter = null;
        if (persona && (persona as any).characterId) {
            if ((persona as any).characterId !== character.id) {
                console.log(`[Regenerate API] Fetching linked character ${(persona as any).characterId}`);
                linkedCharacter = await characterService.getById((persona as any).characterId);

                if (linkedCharacter) {
                    const linkedMemories = await memoryService.searchMemories(linkedCharacter.id, content);
                    if (linkedMemories.length > 0) {
                        console.log(`[Regenerate API] Found ${linkedMemories.length} linked memories`);
                        memories.push(...linkedMemories);
                    }
                }
            } else {
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

        // Scan Lorebooks
        let lorebookContent: { content: string; createdAt: string }[] = [];
        const lorebooks = session.lorebooks ? JSON.parse(session.lorebooks) : (character.lorebooks ? JSON.parse(character.lorebooks) : []);

        if (lorebooks && lorebooks.length > 0) {
            // 1. Get Always Included Entries
            const alwaysIncluded = await lorebookService.getAlwaysIncluded(lorebooks);

            // 2. Scan for Dynamic Entries
            const recentHistory = history.slice(-3).map(m => m.content).join('\n');
            const scanText = `${recentHistory}\n${content}`;
            const scannedEntries = await lorebookService.scan(scanText, lorebooks);

            lorebookContent = [...alwaysIncluded, ...scannedEntries];
        }

        // Build Prompt
        const { prompt: rawPrompt, breakdown } = contextManager.buildLlama3Prompt(character, persona, history, memories, lorebookContent, session.summary, linkedCharacter);

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
            ...options
        });

        // Strip character name prefix
        const prefix = `${character.name}:`;
        if (responseContent.trim().startsWith(prefix)) {
            responseContent = responseContent.trim().substring(prefix.length).trim();
        } else if (responseContent.trim().startsWith(`${character.name}: `)) {
            responseContent = responseContent.trim().substring(`${character.name}: `.length).trim();
        }

        // Trim response
        responseContent = trimResponse(responseContent, trimLength || 800);

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
