import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';
import { characterService } from '@/services/character-service';
import { personaService } from '@/services/persona-service';
import { llmService } from '@/services/llm-service';
import { contextManager } from '@/lib/context-manager';
import { memoryService } from '@/services/memory-service';
import { lorebookService } from '@/services/lorebook-service';
import { trimResponse } from '@/lib/text-utils';
import { PerformanceLogger } from '@/lib/performance-logger';
import { Logger } from '@/lib/logger';
import { CONFIG } from '@/config';

export async function POST(request: NextRequest) {
    let logger: PerformanceLogger | undefined;

    try {
        const body = await request.json();
        const { sessionId, content, model, personaId, lorebooks, options, trimLength, performanceLogging } = body;

        if (!sessionId || !content) {
            return new NextResponse('Missing sessionId or content', { status: 400 });
        }

        // Initialize Logger
        logger = new PerformanceLogger(sessionId, model || 'default', performanceLogging);
        logger.startTimer('total');
        logger.startTimer('preprocessing');

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
        Logger.debug(`[Chat API] Saving user message for session ${sessionId} as ${senderName}`);
        const [userMsg] = await chatService.addMessage(sessionId, 'user', content, undefined, senderName);

        // 3. Get History
        const history = await chatService.getMessages(sessionId);
        Logger.debug(`[Chat API] Retrieved ${history.length} messages from history`);

        logger.endTimer('preprocessing');

        // 4. Build Context (Raw Llama 3 Prompt)
        logger.startTimer('memory_search');

        // Expand memory search to include recent context (last 3 messages + current)
        const memoryContext = [
            ...history.slice(-3).map(m => m.content),
            content
        ].join(' ');
        Logger.debug(`[Chat API] Searching memories for character ${character.id} with context length: ${memoryContext.length}`);

        // Note: Currently memoryService doesn't return total matches vs dropped. 
        // We log what we get.
        const { memories, total } = await memoryService.searchMemories(character.id, memoryContext);

        // Calculate Memory Age Stats
        if (memories.length > 0) {
            // Filter out memories with null createdAt and ensure date strings
            const validDates = memories
                .map((m: any) => m.createdAt)
                .filter((d: any): d is string => d !== null);
            logger.calculateAgeStats(validDates, 'memory');

            const scores = memories.map((m: any) => m.score);
            logger.calculateScoreStats(scores, 'memory');
        }

        // Log metrics immediately
        logger.logMetric('context_memories_total', total);

        const includedCount = memories.length;
        const droppedCount = total - includedCount;

        logger.logMetric('context_memories_dropped', droppedCount);
        if (total > 0) {
            logger.logMetric('context_memories_dropped_pct', (droppedCount / total) * 100);
        } else {
            logger.logMetric('context_memories_dropped_pct', 0);
        }

        // Linked Character Logic REMOVED for standard chat flow as requested.
        // Persona memories should only be injected in impersonation calls.

        logger.endTimer('memory_search');

        Logger.debug(`[Chat API] Found ${memories.length} relevant memories`);

        // Scan Lorebooks
        logger.startTimer('lore_scan');
        let lorebookContent: { content: string; createdAt: string }[] = [];
        if (lorebooks && lorebooks.length > 0) {
            // 1. Get Always Included Entries
            const alwaysIncluded = await lorebookService.getAlwaysIncluded(lorebooks);
            Logger.debug(`[Chat API] Found ${alwaysIncluded.length} always-included lorebook entries`);

            // 2. Scan for Dynamic Entries (last 3 messages + current message)
            const recentHistory = history.slice(-3).map(m => m.content).join('\n');
            const scanText = `${recentHistory}\n${content}`;

            Logger.debug(`[Chat API] Scanning lorebooks: ${lorebooks.join(', ')} (History depth: 3)`);
            const scannedEntries = await lorebookService.scan(scanText, lorebooks);
            Logger.debug(`[Chat API] Found ${scannedEntries.length} dynamic lorebook matches`);

            // Merge: Always Included first, then Scanned
            lorebookContent = [...alwaysIncluded, ...scannedEntries];

            if (lorebookContent.length > 0) {
                logger.calculateAgeStats(lorebookContent.map(l => l.createdAt), 'lore');
            }
            logger.logMetric('context_lore_total', lorebookContent.length);
        }
        logger.endTimer('lore_scan');

        // Linked Character Logic
        let linkedCharacter = null;
        if (persona && (persona as any).characterId) {
            if ((persona as any).characterId !== character.id) {
                Logger.debug(`[Regenerate API] Fetching linked character ${(persona as any).characterId}`);
                linkedCharacter = await characterService.getById((persona as any).characterId);
            }
        }
        // Use the new Llama 3 prompt builder
        logger.startTimer('context_construction');
        const { prompt: rawPrompt, breakdown } = contextManager.buildLlama3Prompt(character, persona, history, memories, lorebookContent, session.summary, linkedCharacter, (session as any).responseStyle);
        logger.endTimer('context_construction');

        // Log Breakdown
        logger.logMetric('context_usage_system_chars', breakdown.system);
        logger.logMetric('context_usage_memories_chars', breakdown.memories);
        logger.logMetric('context_usage_lore_chars', breakdown.lorebook);
        logger.logMetric('context_usage_history_chars', breakdown.history);
        logger.logMetric('context_usage_summary_chars', breakdown.summary);
        logger.logMetric('context_usage_total_chars', breakdown.total);

        Logger.debug(`[Chat API] Built raw prompt (length: ${rawPrompt.length})`);

        // 5. Call LLM (Generate)
        let selectedModel = model;
        if (!selectedModel) {
            selectedModel = CONFIG.OLLAMA_CHAT_MODEL;
        }
        Logger.info(`[Chat API] Calling LLM generate with model: ${selectedModel}`);

        // Get model info for context size
        const modelInfo = await llmService.getModelInfo(selectedModel);

        // Use user preference (12288) or default to 8192
        let contextLimit = 8192;
        logger.logMetric('context_limit_chars', contextLimit * 4); // Approx chars
        logger.logMetric('context_usage_pct', (rawPrompt.length / (contextLimit * 4)) * 100);

        // Check Context Usage & Summarize if needed (e.g., > 80% usage)
        const SAFE_CHAR_LIMIT = contextLimit * 4 * 0.80; // Using 4 chars per token as a safer estimate

        if (rawPrompt.length > SAFE_CHAR_LIMIT) {
            Logger.warn(`[Chat API] Context usage high (${rawPrompt.length} > ${SAFE_CHAR_LIMIT}). Triggering background summarization...`);

            // Fire and Forget Background Task
            (async () => {
                try {
                    const MESSAGES_TO_SUMMARIZE = 10;
                    if (history.length > MESSAGES_TO_SUMMARIZE + 5) { // Ensure we leave at least 5 recent messages
                        const chunk = history.slice(0, MESSAGES_TO_SUMMARIZE);
                        const summaryText = await chatService.summarizeHistory(sessionId, chunk);

                        if (summaryText) {
                            Logger.info(`[Chat API] Background summary generated: ${summaryText.substring(0, 50)}...`);

                            // Append to existing summary
                            const newSummary = (session.summary ? session.summary + "\n\n" : "") + summaryText;
                            await chatService.updateSummary(sessionId, newSummary);

                            // Delete summarized messages
                            const idsToDelete = chunk.map(m => m.id);
                            await chatService.deleteMessages(idsToDelete);
                            Logger.info(`[Chat API] Deleted ${idsToDelete.length} summarized messages.`);

                            // --- Strategy B: Lorebook Reflection (Restored) ---
                            await chatService.generateSessionReflection(sessionId);
                            // ---------------------------------------

                        }
                    }
                } catch (bgErr) {
                    Logger.error('[Chat API] Background summarization task failed:', bgErr);
                }
            })();
        }

        // Capture the prompt and metadata for debugging
        const promptUsed = JSON.stringify({
            prompt: rawPrompt,
            breakdown,
            model: selectedModel,
            contextLimit
        });

        // Calculate effective temperature based on style
        let effectiveOptions = { ...options };
        if ((session as any).responseStyle === 'short' && (session as any).shortTemperature != null) {
            effectiveOptions.temperature = (session as any).shortTemperature;
            Logger.debug(`[Chat API] Using Short form temperature override: ${effectiveOptions.temperature}`);
        } else if ((session as any).responseStyle === 'long' && (session as any).longTemperature != null) {
            effectiveOptions.temperature = (session as any).longTemperature;
            Logger.debug(`[Chat API] Using Long form temperature override: ${effectiveOptions.temperature}`);
        }

        logger.startTimer('llm_generation');
        let responseContent = await llmService.generate(selectedModel, rawPrompt, {
            stop: ['<|eot_id|>', `${persona?.name || 'User'}:`], // Stop tokens to prevent self-conversation
            ...effectiveOptions
        });
        logger.endTimer('llm_generation');
        Logger.llm('generate', { prompt: rawPrompt, response: responseContent, model: selectedModel });
        Logger.debug(`[Chat API] Received response from LLM: ${responseContent.substring(0, 50)}...`);

        logger.startTimer('postprocessing');
        // Strip character name prefix if present (e.g. "CharacterName: Hello")
        const prefix = `${character.name}:`;
        if (responseContent.trim().startsWith(prefix)) {
            responseContent = responseContent.trim().substring(prefix.length).trim();
        } else if (responseContent.trim().startsWith(`${character.name}: `)) { // Handle potential spacing variations
            responseContent = responseContent.trim().substring(`${character.name}: `.length).trim();
        }

        // Trim response to 800 chars / complete sentence
        responseContent = trimResponse(responseContent, trimLength || 800);
        Logger.debug(`[Chat API] Trimmed response: ${responseContent}`);

        // 6. Save Assistant Message with Prompt
        const [assistantMsg] = await chatService.addMessage(sessionId, 'assistant', responseContent, promptUsed, character.name);
        Logger.debug(`[Chat API] Saved assistant message ${assistantMsg.id}`);

        // 7. Generate new memory and Prune History
        // Only generate memory every 3 turns (every 3rd user message)
        // We use the persistent userTurnCount from the session + 1 (for the current message)
        const currentTurnCount = ((session.userTurnCount || 0) + 1);

        if (currentTurnCount > 0 && currentTurnCount % 3 === 0) {
            Logger.debug(`[Chat API] Triggering memory generation (Turn Count: ${currentTurnCount})`);

            // Fetch updated history to include the new assistant message
            const currentPersonaName = persona?.name || 'User';

            // Run Memory Generation & Pruning in Background (Fire & Forget)
            (async () => {
                try {
                    // Generate for Assistant Character
                    // Use 'history' (pre-response) as requested to exclude the latest assistant response
                    Logger.debug(`[Chat API] background memory task started for ${character.name}`);
                    await memoryService.generateMemoryFromChat(character.id, history, memories, lorebookContent, currentPersonaName, character.name);

                    // Generate for Linked Persona (if applicable)
                    if (persona && (persona as any).characterId) {
                        const linkedCharId = (persona as any).characterId;
                        // Ensure we don't double-generate if persona is linked to the SAME character
                        if (linkedCharId !== character.id) {
                            Logger.debug(`[Chat API] Triggering linked memory generation for Persona Linked Char ${linkedCharId}`);
                            await memoryService.generateMemoryFromChat(linkedCharId, history, memories, lorebookContent, currentPersonaName, character.name);
                        }
                    }

                    // 8. Prune History (Optional)
                    // If RETAIN_CHAT_HISTORY is false (default), we prune to keep context focused.
                    if (!CONFIG.RETAIN_CHAT_HISTORY) {
                        // Re-fetch history to ensure we prune based on the absolutely latest state including the new assistant msg
                        const updatedHistory = await chatService.getMessages(sessionId);

                        // Prune based on User Message Count to guarantee the cycle (Keep last 3 User messages + responses)
                        // This ensures the next trigger happens in exactly 3 turns.
                        const userMessages = updatedHistory.filter(m => m.role === 'user');
                        const TARGET_USER_COUNT = 3;

                        if (userMessages.length > TARGET_USER_COUNT) {
                            // Find the ID of the 3rd to last user message
                            const cutoffUserMsg = userMessages[userMessages.length - TARGET_USER_COUNT];
                            const cutoffIndex = updatedHistory.findIndex(m => m.id === cutoffUserMsg.id);

                            if (cutoffIndex > 0) {
                                const messagesToDelete = updatedHistory.slice(0, cutoffIndex);
                                const idsToDelete = messagesToDelete.map(m => m.id);

                                if (idsToDelete.length > 0) {
                                    await chatService.deleteMessages(idsToDelete);
                                    Logger.info(`[Chat API] Pruned history to last ${TARGET_USER_COUNT} user turns. Deleted ${idsToDelete.length} old messages.`);
                                }
                            }
                        }
                    } else {
                        Logger.debug('[Chat API] Skipping history pruning (RETAIN_CHAT_HISTORY enabled)');
                    }
                } catch (err) {
                    Logger.error('[Chat API] Background memory task failed:', err);
                }
            })(); // Invoke immediately un-awaited
        } else {
            Logger.debug(`[Chat API] Skipping memory generation (History length: ${history.length}, threshold: 3 turns)`);
        }

        // --- Periodic Reflection (Every 20 Turns) ---
        // ONLY valid if chat history is NOT retained (otherwise summarization handles it)
        if (!CONFIG.RETAIN_CHAT_HISTORY && currentTurnCount > 0 && currentTurnCount % 13 === 0) {
            Logger.info(`[Chat API] Triggering Periodic Reflection (Turn ${currentTurnCount})...`);
            (async () => {
                await chatService.generateSessionReflection(sessionId);
            })();
        }

        logger.endTimer('postprocessing');

        logger.endTimer('total');
        logger.flush();

        return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg });

    } catch (error) {
        Logger.error('[Chat API] Error in chat endpoint:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

// Local helper removed. Logic moved to chatService.generateSessionReflection.
