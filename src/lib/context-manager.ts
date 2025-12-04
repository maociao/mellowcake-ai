import { characters, personas, chatMessages, memories } from '@/lib/db/schema';


// Helper types based on schema
type DBCharacter = typeof characters.$inferSelect;
type DBPersona = typeof personas.$inferSelect;
type DBMessage = typeof chatMessages.$inferSelect;
type DBMemory = typeof memories.$inferSelect;

export const contextManager = {
    buildContext(
        character: DBCharacter,
        persona: DBPersona | null,
        history: DBMessage[],
        relevantMemories: DBMemory[] = []
    ) {
        const charName = character.name;
        const userName = persona?.name || 'User';

        const replaceVariables = (text: string) => {
            if (!text) return '';
            return text
                .replace(/{{char}}/gi, charName)
                .replace(/{{user}}/gi, userName);
        };

        const systemPromptParts = [];

        // 1. Character Description & Personality
        if (character.description) {
            systemPromptParts.push(`[Character Description]\n${replaceVariables(character.description)}`);
        }
        if (character.personality) {
            systemPromptParts.push(`[Personality]\n${replaceVariables(character.personality)}`);
        }

        // 2. Scenario
        if (character.scenario) {
            systemPromptParts.push(`[Scenario]\n${replaceVariables(character.scenario)}`);
        }

        // 3. Persona
        if (persona) {
            systemPromptParts.push(`[User Persona]\nName: ${persona.name}\n${replaceVariables(persona.description || '')}`);
        }

        // 4. Memories
        if (relevantMemories.length > 0) {
            const memoryText = relevantMemories.map(m => `- ${replaceVariables(m.content)}`).join('\n');
            systemPromptParts.push(`[Memories]\n${memoryText}`);
        }

        // 5. Custom System Prompt (if any)
        if (character.systemPrompt) {
            systemPromptParts.push(`[System Instruction]\n${replaceVariables(character.systemPrompt)}`);
        }

        const systemMessage = {
            role: 'system' as const,
            content: systemPromptParts.join('\n\n')
        };

        // Format history
        const formattedHistory = history.map(msg => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: replaceVariables(msg.content)
        }));

        if (formattedHistory.length === 0 && character.firstMessage) {
            formattedHistory.push({
                role: 'assistant',
                content: replaceVariables(character.firstMessage)
            });
        }

        return [systemMessage, ...formattedHistory];
    },

    buildLlama3Prompt(
        character: DBCharacter,
        persona: DBPersona | null,
        history: DBMessage[],
        relevantMemories: DBMemory[] = []
    ) {
        const charName = character.name;
        const userName = persona?.name || 'User';

        const replaceVariables = (text: string) => {
            if (!text) return '';
            return text
                .replace(/{{char}}/gi, charName)
                .replace(/{{user}}/gi, userName);
        };

        // --- System Prompt Construction ---
        const systemPromptParts = [];
        // Standard Llama 3 System Header
        // "You are {{char}}. Reply as {{char}} only..."
        systemPromptParts.push(`Main: You are ${charName}. Reply as ${charName} only. Italicize actions and descriptions, and avoid quotation marks. Use markdown.`);
        systemPromptParts.push(`NSFW: NSFW/Smut is allowed.`);

        if (character.description) systemPromptParts.push(replaceVariables(character.description));
        if (character.personality) systemPromptParts.push(`${charName}'s personality: ${replaceVariables(character.personality)}`);
        if (character.scenario) systemPromptParts.push(`Scenario: ${replaceVariables(character.scenario)}`);

        // Persona injection
        if (persona) {
            // User requested specific formatting for persona? They just showed it in the example.
            // Let's stick to a simple description for now or append to system.
            systemPromptParts.push(`[User Persona]\nName: ${persona.name}\n${replaceVariables(persona.description || '')}`);
        }

        if (relevantMemories.length > 0) {
            const memoryText = relevantMemories.map(m => `- ${replaceVariables(m.content)}`).join('\n');
            systemPromptParts.push(`[Memories]\n${memoryText}`);
        }

        if (character.systemPrompt) systemPromptParts.push(replaceVariables(character.systemPrompt));

        const systemContent = systemPromptParts.join('\n');

        // --- Llama 3 Formatting ---
        let prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${systemContent}<|eot_id|>`;

        // --- History ---
        // Handle first message
        if (history.length === 0 && character.firstMessage) {
            prompt += `<|start_header_id|>assistant<|end_header_id|>\n${charName}: ${replaceVariables(character.firstMessage)}<|eot_id|>`;
        }

        for (const msg of history) {
            const role = msg.role === 'user' ? 'user' : 'assistant';
            const name = msg.role === 'user' ? userName : charName;
            const content = replaceVariables(msg.content);

            prompt += `<|start_header_id|>${role}<|end_header_id|>\n${name}: ${content}<|eot_id|>`;
        }

        // --- Assistant Prime ---
        prompt += `<|start_header_id|>assistant<|end_header_id|>\n${charName}:`;

        return prompt;
    }
};
