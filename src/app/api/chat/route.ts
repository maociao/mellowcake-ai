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
        const { sessionId, content, model, personaId, lorebooks } = body;

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
        await chatService.addMessage(sessionId, 'user', content, undefined, senderName);

        // 3. Get History
        const history = await chatService.getMessages(sessionId);
        console.log(`[Chat API] Retrieved ${history.length} messages from history`);

        // 4. Build Context (Raw Llama 3 Prompt)
        console.log(`[Chat API] Searching memories for character ${character.id} with query: "${content}"`);
        const memories = await memoryService.searchMemories(character.id, content);
        console.log(`[Chat API] Found ${memories.length} relevant memories`);

        // Scan Lorebooks
        let lorebookContent: { content: string; createdAt: string }[] = [];
        if (lorebooks && lorebooks.length > 0) {
            // Scan last 5 messages + current message
            const recentHistory = history.slice(-5).map(m => m.content).join('\n');
            const scanText = `${recentHistory}\n${content}`;

            console.log(`[Chat API] Scanning lorebooks: ${lorebooks.join(', ')} (History depth: 5)`);
            lorebookContent = await lorebookService.scan(scanText, lorebooks);
            console.log(`[Chat API] Found ${lorebookContent.length} lorebook matches`);
        }

        // Use the new Llama 3 prompt builder
        const { prompt: rawPrompt, breakdown } = contextManager.buildLlama3Prompt(character, persona, history, memories, lorebookContent, session.summary);
        console.log(`[Chat API] Built raw prompt (length: ${rawPrompt.length})`);

        // 5. Call LLM (Generate)
        let selectedModel = model;
        if (!selectedModel) {
            const models = await llmService.getModels();
            if (models.length > 0) {
                selectedModel = models[0].name;
            } else {
                selectedModel = 'llama3:latest'; // Fallback
            }
        }
        console.log(`[Chat API] Calling LLM generate with model: ${selectedModel}`);

        // Get model info for context size
        const modelInfo = await llmService.getModelInfo(selectedModel);

        // Use user preference (12288) or default to 8192
        // Ideally this should be a setting. For now, we hardcode the user's request.
        // Use user preference (12288) or default to 8192
        // Ideally this should be a setting. For now, we hardcode the user's request.
        let contextLimit = 8192;

        // Check Context Usage & Summarize if needed (e.g., > 80% usage)
        // We use a safe buffer. If prompt length > contextLimit * 0.8, we summarize.
        // Note: prompt length is chars, contextLimit is tokens. Approx 3-4 chars per token.
        // So safe limit in chars is contextLimit * 3 * 0.8
        const SAFE_CHAR_LIMIT = contextLimit * 4 * 0.8; // Using 4 chars per token as a safer estimate

        if (rawPrompt.length > SAFE_CHAR_LIMIT) {
            console.log(`[Chat API] Context usage high (${rawPrompt.length} > ${SAFE_CHAR_LIMIT}). Triggering summarization...`);

            // Summarize the oldest 10 messages (excluding the very first if it's special, but here we just take first 10)
            // We need to keep the system prompt and recent history intact.
            // The history array passed to buildLlama3Prompt is the full history.

            // We want to summarize the *oldest* messages in the history array.
            // history[0] is the oldest.
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
                }
            }
        }

        // Re-build prompt if summary changed? 
        // For this request, we use the *current* state. The summary update will apply to the *next* turn.
        // This is acceptable for a "lazy" summarization strategy.
        // If we are ALREADY over the limit, the LLM might error.
        // But usually we have some buffer.

        // Capture the prompt and metadata for debugging
        const promptUsed = JSON.stringify({
            prompt: rawPrompt,
            breakdown,
            model: selectedModel,
            contextLimit
        });

        let responseContent = await llmService.generate(selectedModel, rawPrompt, {
            stop: ['<|eot_id|>', `${persona?.name || 'User'}:`] // Stop tokens to prevent self-conversation
        });
        console.log(`[Chat API] Received response from LLM: ${responseContent.substring(0, 50)}...`);

        // Strip character name prefix if present (e.g. "CharacterName: Hello")
        const prefix = `${character.name}:`;
        if (responseContent.trim().startsWith(prefix)) {
            responseContent = responseContent.trim().substring(prefix.length).trim();
        } else if (responseContent.trim().startsWith(`${character.name}: `)) { // Handle potential spacing variations
            responseContent = responseContent.trim().substring(`${character.name}: `.length).trim();
        }

        // 6. Save Assistant Message with Prompt
        const [assistantMsg] = await chatService.addMessage(sessionId, 'assistant', responseContent, promptUsed, character.name);
        console.log(`[Chat API] Saved assistant message ${assistantMsg.id}`);

        // 7. Generate new memory (async, don't block response)
        // We can do this in background or just await it if fast enough. 
        // For now, let's await it to ensure it works, but maybe only every few messages?
        // Let's keep it simple for now and NOT generate automatically on every message to avoid latency.
        // For testing, we are enabling it now.
        memoryService.generateMemoryFromChat(character.id, history).catch(err => console.error('Memory generation failed:', err));

        return NextResponse.json(assistantMsg);

    } catch (error) {
        console.error('[Chat API] Error in chat endpoint:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
