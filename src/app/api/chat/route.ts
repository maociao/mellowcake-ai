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
        console.log(`[Chat API] Saving user message for session ${sessionId}`);
        await chatService.addMessage(sessionId, 'user', content);

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
        const rawPrompt = contextManager.buildLlama3Prompt(character, persona, history, memories, lorebookContent);
        console.log(`[Chat API] Built raw prompt (length: ${rawPrompt.length})`);

        // Capture the prompt for debugging
        const promptUsed = rawPrompt;

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

        const responseContent = await llmService.generate(selectedModel, rawPrompt, {
            stop: ['<|eot_id|>', `${character.name}:`, `${persona?.name || 'User'}:`] // Stop tokens to prevent self-conversation
        });
        console.log(`[Chat API] Received response from LLM: ${responseContent.substring(0, 50)}...`);

        // 6. Save Assistant Message with Prompt
        const [assistantMsg] = await chatService.addMessage(sessionId, 'assistant', responseContent, promptUsed);
        console.log(`[Chat API] Saved assistant message ${assistantMsg.id}`);

        // 7. Generate new memory (async, don't block response)
        // We can do this in background or just await it if fast enough. 
        // For now, let's await it to ensure it works, but maybe only every few messages?
        // Let's keep it simple for now and NOT generate automatically on every message to avoid latency.
        // memoryService.generateMemoryFromChat(character.id, history); 

        return NextResponse.json(assistantMsg);

    } catch (error) {
        console.error('[Chat API] Error in chat endpoint:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
