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
        console.log(`[Chat API] Saving user message for session ${sessionId} as ${senderName}`);
        const [userMsg] = await chatService.addMessage(sessionId, 'user', content, undefined, senderName);

        // 3. Get History
        const history = await chatService.getMessages(sessionId);
        console.log(`[Chat API] Retrieved ${history.length} messages from history`);

        logger.endTimer('preprocessing');

        // 4. Build Context (Raw Llama 3 Prompt)
        logger.startTimer('memory_search');

        // Expand memory search to include recent context (last 3 messages + current)
        const memoryContext = [
            ...history.slice(-3).map(m => m.content),
            content
        ].join(' ');
        console.log(`[Chat API] Searching memories for character ${character.id} with context length: ${memoryContext.length}`);

        // Note: Currently memoryService doesn't return total matches vs dropped. 
        // We log what we get.
        const { memories, totalFound } = await memoryService.searchMemories(character.id, memoryContext);

        // Calculate Memory Age Stats
        if (memories.length > 0) {
            // Filter out memories with null createdAt and ensure date strings
            const validDates = memories
                .map(m => m.createdAt)
                .filter((d): d is string => d !== null);
            logger.calculateAgeStats(validDates, 'memory');

            const scores = memories.map(m => m.score);
            logger.calculateScoreStats(scores, 'memory');
        }

        // Log metrics immediately
        logger.logMetric('context_memories_total', totalFound);

        const includedCount = memories.length;
        const droppedCount = totalFound - includedCount;

        logger.logMetric('context_memories_dropped', droppedCount);
        if (totalFound > 0) {
            logger.logMetric('context_memories_dropped_pct', (droppedCount / totalFound) * 100);
        } else {
            logger.logMetric('context_memories_dropped_pct', 0);
        }

        // Linked Character Logic REMOVED for standard chat flow as requested.
        // Persona memories should only be injected in impersonation calls.

        logger.endTimer('memory_search');

        console.log(`[Chat API] Found ${memories.length} relevant memories`);

        // Scan Lorebooks
        logger.startTimer('lore_scan');
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
                console.log(`[Regenerate API] Fetching linked character ${(persona as any).characterId}`);
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
        logger.logMetric('context_limit_chars', contextLimit * 4); // Approx chars
        logger.logMetric('context_usage_pct', (rawPrompt.length / (contextLimit * 4)) * 100);

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

        // Calculate effective temperature based on style
        let effectiveOptions = { ...options };
        if ((session as any).responseStyle === 'short' && (session as any).shortTemperature != null) {
            effectiveOptions.temperature = (session as any).shortTemperature;
            console.log(`[Chat API] Using Short form temperature override: ${effectiveOptions.temperature}`);
        } else if ((session as any).responseStyle === 'long' && (session as any).longTemperature != null) {
            effectiveOptions.temperature = (session as any).longTemperature;
            console.log(`[Chat API] Using Long form temperature override: ${effectiveOptions.temperature}`);
        }

        logger.startTimer('llm_generation');
        let responseContent = await llmService.generate(selectedModel, rawPrompt, {
            stop: ['<|eot_id|>', `${persona?.name || 'User'}:`], // Stop tokens to prevent self-conversation
            ...effectiveOptions
        });
        logger.endTimer('llm_generation');
        console.log(`[Chat API] Received response from LLM: ${responseContent.substring(0, 50)}...`);

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
        logger.endTimer('postprocessing');

        logger.endTimer('total');
        logger.flush();

        return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg });

    } catch (error) {
        console.error('[Chat API] Error in chat endpoint:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
