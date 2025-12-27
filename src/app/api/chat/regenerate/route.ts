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

import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
    let logger: PerformanceLogger | undefined;

    try {
        const body = await request.json();
        const { messageId, options, trimLength, personaId, lorebooks: lorebooksOverride, performanceLogging } = body;

        if (!messageId) {
            return new NextResponse('Missing messageId', { status: 400 });
        }

        // Initialize Logger
        logger = new PerformanceLogger('unknown', 'default', performanceLogging);
        logger.startTimer('total');
        logger.startTimer('preprocessing');

        // 1. Get the target message to find session
        const targetMsg = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).get();
        if (!targetMsg) return new NextResponse('Message not found', { status: 404 });

        const sessionId = targetMsg.sessionId;
        // Update logger sessionId
        logger.logMetric('sessionId' as any, sessionId);

        // 2. Get Session & Details
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

        logger.endTimer('preprocessing');
        logger.startTimer('memory_search');

        // 4. Build Context (Same logic as chat route)
        console.log(`[Regenerate API] Searching memories for character ${character.id} with query: "${content}"`);
        // Note: Currently memoryService returns { memories, totalFound }
        const { memories, totalFound } = await memoryService.searchMemories(character.id, content);

        // Calculate Memory Age Stats
        if (memories.length > 0) {
            const validDates = memories.map(m => m.createdAt).filter((d): d is string => d !== null);
            logger.calculateAgeStats(validDates, 'memory');

            const scores = memories.map(m => m.score);
            logger.calculateScoreStats(scores, 'memory');
        }
        // Linked Character Logic
        let linkedCharacter = null;
        if (persona && (persona as any).characterId) {
            if ((persona as any).characterId !== character.id) {
                console.log(`[Regenerate API] Fetching linked character ${(persona as any).characterId}`);
                linkedCharacter = await characterService.getById((persona as any).characterId);
            }
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

        // Linked Character Logic REMOVED for regenerate flow as requested.
        // Persona memories should only be injected in impersonation calls.

        logger.endTimer('memory_search');
        logger.startTimer('lore_scan');

        // Scan Lorebooks
        let lorebookContent: { content: string; createdAt: string }[] = [];

        // Use override if provided, otherwise session default, otherwise character default
        let lorebooks = lorebooksOverride;
        if (!lorebooks) {
            lorebooks = session.lorebooks ? JSON.parse(session.lorebooks) : (character.lorebooks ? JSON.parse(character.lorebooks) : []);
        }

        if (lorebooks && lorebooks.length > 0) {
            // 1. Get Always Included Entries
            const alwaysIncluded = await lorebookService.getAlwaysIncluded(lorebooks);

            // 2. Scan for Dynamic Entries
            const recentHistory = history.slice(-3).map(m => m.content).join('\n');
            const scanText = `${recentHistory}\n${content}`;
            const scannedEntries = await lorebookService.scan(scanText, lorebooks);

            lorebookContent = [...alwaysIncluded, ...scannedEntries];

            if (lorebookContent.length > 0) {
                logger.calculateAgeStats(lorebookContent.map(l => l.createdAt), 'lore');
            }
            logger.logMetric('context_lore_total', lorebookContent.length);
        }
        logger.endTimer('lore_scan');

        // Build Prompt
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

        // 5. Call LLM
        // Use default model or try to find what was used? Let's use default/stheno preference
        const models = await llmService.getModels();
        const selectedModel = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

        logger.logMetric('model' as any, selectedModel);

        // Get model info for context size
        const modelInfo = await llmService.getModelInfo(selectedModel);
        const contextLimit = 8192; // Default

        logger.logMetric('context_limit_chars', contextLimit * 4);
        logger.logMetric('context_usage_pct', (rawPrompt.length / (contextLimit * 4)) * 100);

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
        } else if ((session as any).responseStyle === 'long' && (session as any).longTemperature != null) {
            effectiveOptions.temperature = (session as any).longTemperature;
        }

        console.log(`[Regenerate API] Calling LLM generate with model: ${selectedModel}, Temp: ${effectiveOptions.temperature}`);
        logger.startTimer('llm_generation');
        let responseContent = await llmService.generate(selectedModel, rawPrompt, {
            stop: ['<|eot_id|>', `${persona?.name || 'User'}:`],
            ...effectiveOptions
        });
        logger.endTimer('llm_generation');

        logger.startTimer('postprocessing');
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
        logger.endTimer('postprocessing');

        logger.endTimer('total');
        logger.flush();

        const [updatedMessage] = updatedMessages;
        return NextResponse.json(updatedMessage);

    } catch (error) {
        console.error('[Regenerate API] Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
