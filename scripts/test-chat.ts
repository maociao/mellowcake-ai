import { chatService } from '../src/services/chat-service';
import { characterService } from '../src/services/character-service';
import { llmService } from '../src/services/llm-service';
import { contextManager } from '../src/lib/context-manager';

async function testChat() {
    console.log('Testing Chat Flow...');

    // 1. Get a character
    const chars = await characterService.getAll();
    if (chars.length === 0) {
        console.error('No characters found. Run migration first.');
        return;
    }
    const char = chars[0];
    console.log(`Using character: ${char.name}`);

    // 2. Create Session
    const [session] = await chatService.createSession(char.id, undefined, 'Test Session');
    console.log(`Created session: ${session.id}`);

    // 3. Send Message (Simulating API logic)
    const userContent = 'Hello! Who are you?';
    console.log(`User: ${userContent}`);

    await chatService.addMessage(session.id, 'user', userContent);
    const history = await chatService.getMessages(session.id);
    const messages = contextManager.buildContext(char, null, history);

    console.log('Sending to LLM...');
    try {
        // Use a model that likely exists, or list them first
        const models = await llmService.getModels();
        const modelName = models.length > 0 ? models[0].name : 'llama3:latest';
        console.log(`Using model: ${modelName}`);

        const response = await llmService.chat(modelName, messages);
        console.log(`Assistant: ${response}`);

        await chatService.addMessage(session.id, 'assistant', response);
    } catch (e) {
        console.error('LLM Call failed:', e);
    }
}

testChat().catch(console.error);
