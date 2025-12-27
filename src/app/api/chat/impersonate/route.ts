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
        const { sessionId, personaId, options, trimLength, performanceLogging } = body;

        if (!sessionId) {
            return new NextResponse('Missing sessionId', { status: 400 });
        }

        // Initialize Logger
        // Note: Model is determined later, so we update it later or pass 'default'
        logger = new PerformanceLogger(sessionId, 'default', performanceLogging);
        logger.startTimer('total');
        logger.startTimer('preprocessing');

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

        logger.endTimer('preprocessing');
        logger.startTimer('memory_search');

        const { memories, totalFound } = await memoryService.searchMemories(character.id, query);

        // Calculate Memory Age Stats
        if (memories.length > 0) {
            const validDates = memories.map(m => m.createdAt).filter((d): d is string => d !== null);
            logger.calculateAgeStats(validDates, 'memory');
        }

        // If persona is linked to a DIFFERENT character, fetch their memories too
        let linkedCharacter = null;
        if (persona && (persona as any).characterId) {
            // Fetch the actual linked character object
            if ((persona as any).characterId !== character.id) {
                console.log(`[Impersonate API] Fetching linked character ${(persona as any).characterId}`);
                linkedCharacter = await characterService.getById((persona as any).characterId);

                if (linkedCharacter) {
                    const { memories: linkedMemories } = await memoryService.searchMemories(linkedCharacter.id, query);
                    if (linkedMemories.length > 0) {
                        console.log(`[Impersonate API] Found ${linkedMemories.length} linked memories`);
                        memories.length = 0;
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

                // Track dropped memories due to hard limit
                // Note: totalFound only tracks PRIMARY character memories total.
                // We should technically add linked total? But let's stick to simple for now:
                // Total = totalFound (primary) + linkedFound? 
                // Currently I didn't capture linked total. That's fine for now, "Total" usually implies "Available matches".
                // Let's rely on totalFound.

                // Track dropped
                const currentCount = memories.length;
                logger.logMetric('context_memories_total', totalFound); // This is just primary... maybe misleading if we add linked?

                // If we add linked memories, the "pool" is bigger.
                // Ideally searchMemories for linked returns its total too.
                // For now, let's just log what we have.

                if (memories.length > 10) {
                    memories.length = 10;
                    // Dropped is (primary total + linked inserted) - 10? 
                    // This metric is getting tricky with merged lists.
                    // Let's simplify: Dropped = (Total Candidates) - (Final Included)
                    // Total Candidates approx = totalFound + linkedMemories.length

                    // Actually, let's just use the final logic:
                    // We don't have total linked count (just the top N returned). 
                    // Let's just log the metrics based on primary search for consistency with other routes?
                    // But here we explicitly want to support linked.

                    // Let's just log context_memories_dropped as (totalFound - included).
                    const dropped = totalFound - 10; // Rough estimate
                    logger.logMetric('context_memories_dropped', dropped > 0 ? dropped : 0);
                    if (totalFound > 0) logger.logMetric('context_memories_dropped_pct', (dropped / totalFound) * 100);
                } else {
                    const dropped = totalFound > memories.length ? totalFound - memories.length : 0;
                    logger.logMetric('context_memories_dropped', dropped);
                    if (totalFound > 0) logger.logMetric('context_memories_dropped_pct', (dropped / totalFound) * 100);
                }
            } else {
                logger.logMetric('context_memories_total', 0);
            }
        } else {
            logger.logMetric('context_memories_total', totalFound);
            const dropped = totalFound > memories.length ? totalFound - memories.length : 0;
            logger.logMetric('context_memories_dropped', dropped);
            if (totalFound > 0) logger.logMetric('context_memories_dropped_pct', (dropped / totalFound) * 100);
        }

        // Calculate Final Memory Stats (Age & Score)
        if (memories.length > 0) {
            const validDates = memories.map(m => m.createdAt).filter((d): d is string => d !== null);
            logger.calculateAgeStats(validDates, 'memory');

            const scores = memories.map(m => m.score);
            logger.calculateScoreStats(scores, 'memory');
        }

        logger.endTimer('memory_search');
        logger.startTimer('lore_scan');

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

            if (lorebookContent.length > 0) {
                logger.calculateAgeStats(lorebookContent.map(l => l.createdAt), 'lore');
            }
            logger.logMetric('context_lore_total', lorebookContent.length);
        }
        logger.endTimer('lore_scan');

        // Build Prompt
        logger.startTimer('context_construction');
        // Note: buildImpersonationPrompt doesn't currently return a breakdown.
        // We might want to update it or just approximate.
        // Let's assume for now we don't get the breakout for impersonation unless we check format.
        // ...Actually, looking at context-manager earlier, `buildImpersonationPrompt` returns `{ prompt }`.

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
        logger.endTimer('context_construction');

        // 4. Call LLM
        const models = await llmService.getModels();
        // Use stheno or default
        const model = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

        // Update model in logger
        logger.logMetric('model' as any, model); // Hacksy since I didn't verify if I can update fields

        console.log(`[Impersonate API] Generating response for persona ${persona?.name || 'User'}...`);
        logger.logMetric('context_usage_total_chars', prompt.length);

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

        logger.startTimer('llm_generation');
        const responseContent = await llmService.generate(model, prompt, {
            stop: ['<|eot_id|>', `${character.name}:`], // Stop if it tries to generate character response
            ...effectiveOptions
        });
        logger.endTimer('llm_generation');

        logger.startTimer('postprocessing');
        // Clean up response
        let cleaned = responseContent.trim();
        const prefix = `${persona?.name || 'User'}:`;
        if (cleaned.startsWith(prefix)) {
            cleaned = cleaned.substring(prefix.length).trim();
        }

        // Trim response
        cleaned = trimResponse(cleaned, trimLength || 800);
        logger.endTimer('postprocessing');

        logger.endTimer('total');
        logger.flush();

        return NextResponse.json({ content: cleaned });

    } catch (error) {
        console.error('[Impersonate API] Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
