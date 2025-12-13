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
        const { sessionId, content, model, personaId, lorebooks, options, trimLength } = body;

        if (!sessionId || !content) {
            return new NextResponse('Missing sessionId or content', { status: 400 });
        }

        // 1. Get Session & Details
        const session = await chatService.getSessionById(sessionId);
        if (!session) return new NextResponse('Session not found', { status: 404 });

        const character = await characterService.getById(session.characterId);
        if (!character) return new NextResponse('Character not found', { status: 404 });

        let persona = null;
        // Use override if provided, otherwise session default
        const activePersonaId = personaId || session.personaId;
        if (activePersonaId) {
            persona = await personaService.getById(activePersonaId);
        }

        // 2. Save User Message
        const senderName = persona?.name || 'User';
        console.log(`[Chat API] Saving user message for session ${sessionId} as ${senderName}`);
        const [userMsg] = await chatService.addMessage(sessionId, 'user', content, undefined, senderName);

        // 3. Get History
        const history = await chatService.getMessages(sessionId);
        console.log(`[Chat API] Retrieved ${history.length} messages from history`);

        // 4. Build Context (Raw Llama 3 Prompt)
        // Expand memory search to include recent context (last 3 messages + current)
        const memoryContext = [
            ...history.slice(-3).map(m => m.content),
            content
        ].join(' ');
        console.log(`[Chat API] Searching memories for character ${character.id} with context length: ${memoryContext.length}`);
        const memories = await memoryService.searchMemories(character.id, memoryContext);

        // Linked Character Logic
        let linkedCharacter = null;
        if (persona && (persona as any).characterId) {
            if ((persona as any).characterId !== character.id) {
                console.log(`[Chat API] Fetching linked character ${(persona as any).characterId}`);
                linkedCharacter = await characterService.getById((persona as any).characterId);

                if (linkedCharacter) {
                    const linkedMemories = await memoryService.searchMemories(linkedCharacter.id, memoryContext);
                    if (linkedMemories.length > 0) {
                        console.log(`[Chat API] Found ${linkedMemories.length} linked memories`);
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

        console.log(`[Chat API] Found ${memories.length} relevant memories`);

        // Scan Lorebooks
        let lorebookContent: { content: string; createdAt: string }[] = [];
        if (lorebooks && lorebooks.length > 0) {
            // 1. Get Always Included Entries
            const alwaysIncluded = await lorebookService.getAlwaysIncluded(lorebooks);
            console.log(`[Chat API] Found ${alwaysIncluded.length} always-included lorebook entries`);

            // 2. Scan for Dynamic Entries (last 3 messages + current message)
            const recentHistory = history.slice(-3).map(m => m.content).join('\n');
            const scanText = `${recentHistory}\n${content}`;

            console.log(`[Chat API] Scanning lorebooks: ${lorebooks.join(', ')} (History depth: 3)`);
            const scannedEntries = await lorebookService.scan(scanText, lorebooks);
            console.log(`[Chat API] Found ${scannedEntries.length} dynamic lorebook matches`);

            // Merge: Always Included first, then Scanned
            lorebookContent = [...alwaysIncluded, ...scannedEntries];
        }

        // Use the new Llama 3 prompt builder
        const { prompt: rawPrompt, breakdown } = contextManager.buildLlama3Prompt(character, persona, history, memories, lorebookContent, session.summary, linkedCharacter);
        console.log(`[Chat API] Built raw prompt (length: ${rawPrompt.length})`);

        // 5. Call LLM (Generate)
        let selectedModel = model;
        if (!selectedModel) {
            const models = await llmService.getModels();
            // Prioritize 'stheno' model if available
            selectedModel = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';
        }
        console.log(`[Chat API] Calling LLM generate with model: ${selectedModel}`);

        // Get model info for context size
        const modelInfo = await llmService.getModelInfo(selectedModel);

        // Use user preference (12288) or default to 8192
        let contextLimit = 8192;

        // Check Context Usage & Summarize if needed (e.g., > 80% usage)
        const SAFE_CHAR_LIMIT = contextLimit * 4 * 0.95; // Using 4 chars per token as a safer estimate

        if (rawPrompt.length > SAFE_CHAR_LIMIT) {
            console.log(`[Chat API] Context usage high (${rawPrompt.length} > ${SAFE_CHAR_LIMIT}). Triggering summarization...`);

            const MESSAGES_TO_SUMMARIZE = 10;
            if (history.length > MESSAGES_TO_SUMMARIZE + 5) { // Ensure we leave at least 5 recent messages
                const chunk = history.slice(0, MESSAGES_TO_SUMMARIZE);
                const summaryText = await chatService.summarizeHistory(sessionId, chunk);

                if (summaryText) {
                    console.log(`[Chat API] Generated summary: ${summaryText.substring(0, 50)}...`);

                    // Append to existing summary
                    const newSummary = (session.summary ? session.summary + "\n\n" : "") + summaryText;
                    await chatService.updateSummary(sessionId, newSummary);

                    // Delete summarized messages
                    const idsToDelete = chunk.map(m => m.id);
                    await chatService.deleteMessages(idsToDelete);
                    console.log(`[Chat API] Deleted ${idsToDelete.length} summarized messages.`);

                    // Persist summary to Lorebook if available
                    if (lorebooks && lorebooks.length > 0) {
                        try {
                            // Generate keywords for the summary
                            console.log('[Chat API] Generating keywords for summary...');
                            const keywordPrompt = `Extract 3-5 comma-separated keywords for this summary: "${summaryText}"`;
                            const keywordRes = await llmService.chat(selectedModel, [{ role: 'user', content: keywordPrompt }]);
                            const keywords = keywordRes ? keywordRes.split(',').map((k: string) => k.trim()) : ['summary'];
                            const keywordJson = JSON.stringify(keywords);

                            // Find all lorebooks
                            const allLorebooks = await lorebookService.getAll();

                            // Iterate through all active lorebooks
                            for (const bookName of lorebooks) {
                                const targetBook = allLorebooks.find(b => b.name === bookName);
                                if (targetBook) {
                                    console.log(`[Chat API] Persisting summary to lorebook: ${targetBook.name}`);
                                    await lorebookService.addEntry(targetBook.id, {
                                        content: summaryText,
                                        keywords: keywordJson,
                                        enabled: true,
                                        label: `Summary ${new Date().toLocaleDateString()}`
                                    });
                                }
                            }
                        } catch (err) {
                            console.error('[Chat API] Failed to persist summary to lorebook:', err);
                        }
                    }
                }
            }
        }

        // Capture the prompt and metadata for debugging
        const promptUsed = JSON.stringify({
            prompt: rawPrompt,
            breakdown,
            model: selectedModel,
            contextLimit
        });

        let responseContent = await llmService.generate(selectedModel, rawPrompt, {
            stop: ['<|eot_id|>', `${persona?.name || 'User'}:`], // Stop tokens to prevent self-conversation
            ...options
        });
        console.log(`[Chat API] Received response from LLM: ${responseContent.substring(0, 50)}...`);

        // Strip character name prefix if present (e.g. "CharacterName: Hello")
        const prefix = `${character.name}:`;
        if (responseContent.trim().startsWith(prefix)) {
            responseContent = responseContent.trim().substring(prefix.length).trim();
        } else if (responseContent.trim().startsWith(`${character.name}: `)) { // Handle potential spacing variations
            responseContent = responseContent.trim().substring(`${character.name}: `.length).trim();
        }

        // Trim response to 800 chars / complete sentence
        responseContent = trimResponse(responseContent, trimLength || 800);

        // 6. Save Assistant Message with Prompt
        const [assistantMsg] = await chatService.addMessage(sessionId, 'assistant', responseContent, promptUsed, character.name);
        console.log(`[Chat API] Saved assistant message ${assistantMsg.id}`);

        // 7. Generate new memory (async, don't block response)
        // Only generate memory every 2 turns (every 2nd user message)
        const userMsgCount = history.filter(m => m.role === 'user').length;
        if (userMsgCount > 0 && userMsgCount % 2 === 0) {
            console.log(`[Chat API] Triggering memory generation (User messages: ${userMsgCount})`);
            const currentPersonaName = persona?.name || 'User';
            memoryService.generateMemoryFromChat(character.id, history, memories, lorebookContent, currentPersonaName, character.name)
                .catch(err => console.error('Memory generation failed:', err));
        } else {
            console.log(`[Chat API] Skipping memory generation (History length: ${history.length}, threshold: 3 turns)`);
        }

        return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg });

    } catch (error) {
        console.error('[Chat API] Error in chat endpoint:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
