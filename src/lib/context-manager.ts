import { characters, personas, chatMessages, memories } from '@/lib/db/schema';


// Helper types based on schema
type DBCharacter = typeof characters.$inferSelect;
type DBPersona = typeof personas.$inferSelect;
type DBMessage = typeof chatMessages.$inferSelect & { name?: string | null };
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
        const formattedHistory = history.map(msg => {
            // CLEAN CONTENT: Remove image tags and markdown links
            let cleanContent = replaceVariables(msg.content)
                .replace(/\[GENERATE_IMAGE:.*?\]/g, '')
                .replace(/!\[.*?\]\(.*?\)/g, '')
                .trim();

            if (!cleanContent) cleanContent = "...";

            return {
                role: msg.role as 'user' | 'assistant' | 'system',
                content: cleanContent
            };
        });

        if (formattedHistory.length === 0 && character.firstMessage) {
            formattedHistory.push({
                role: 'assistant',
                content: replaceVariables(character.firstMessage)
            });
        }

        return [systemMessage, ...formattedHistory];
    },

    buildImpersonationPrompt(
        character: DBCharacter,
        persona: DBPersona | null,
        history: DBMessage[],
        relevantMemories: DBMemory[] = [],
        lorebookContent: { content: string; createdAt: string }[] = [],
        summary: string | null = null,
        linkedCharacter: DBCharacter | null = null,
        responseStyle: 'short' | 'long' = 'long'
    ) {
        const charName = character.name;
        const userName = persona?.name || 'User';

        const replaceVariables = (text: string) => {
            if (!text) return '';
            return text
                .replace(/{{char}}/gi, charName)
                .replace(/{{user}}/gi, userName);
        };

        const replaceLinkedVariables = (text: string) => {
            if (!text) return '';
            // When using a character AS a persona/user:
            // {{char}} (them) -> userName (us)
            // {{user}} (us) -> charName (them)
            return text
                .replace(/{{char}}/gi, userName)
                .replace(/{{user}}/gi, charName);
        };

        // --- System Prompt Construction ---
        const systemPromptParts = [];
        // Inverted Role: You are {{user}}. Reply as {{user}} only.
        systemPromptParts.push(`[Main]`);
        if (responseStyle === 'short') {
            systemPromptParts.push(`You are ${userName}. Reply as ${userName} only. You are talking to ${charName}. Respond with 2 or 3 sentences. Use emojis to express emotion.`);
            systemPromptParts.push(`Past events and memories of the ${charName} are provided below. Use them to inform your responses.`);
            systemPromptParts.push(`NSFW: NSFW/Smut is allowed.`);
        } else {
            systemPromptParts.push(`You are ${userName}. Reply as ${userName} only. You are talking to ${charName}. Italicize actions and descriptions, and avoid quotation marks. Use markdown.`);
            systemPromptParts.push(`Past events and memories of the ${charName} are provided below. Use them to inform your responses.`);
            systemPromptParts.push(`Responses should be short and conversational. Use ellipses (...) for pauses and commas for natural breaks in speech to convey emotion.`);
            systemPromptParts.push(`NSFW: NSFW/Smut is allowed.`);
        }

        // Persona Description (This is now the "Self" description)
        if (linkedCharacter) {
            let userIntro = `${userName} is a ${replaceLinkedVariables(linkedCharacter.appearance || '')}. who is ${replaceLinkedVariables(linkedCharacter.personality || '')}. ${userName} ${replaceLinkedVariables(linkedCharacter.description || '')}`;
            systemPromptParts.push(userIntro);
        } else if (persona) {
            systemPromptParts.push(`Your Profile:\nName: ${persona.name}\n${replaceVariables(persona.description || '')}`);
        }

        // Character Description (This is now the "Other" description)
        systemPromptParts.push(`You are talking to ${charName}.`);

        let characterIntro = `${charName} is a ${replaceVariables(character.appearance || '')}. who is ${replaceVariables(character.personality || '')}. ${charName} ${replaceVariables(character.description || '')}`;
        systemPromptParts.push(characterIntro);

        if (character.scenario) systemPromptParts.push(`Scenario: ${replaceVariables(character.scenario)}`);

        // Lorebook Injection (World Info)
        if (lorebookContent && lorebookContent.length > 0) {
            const sortedEntries = [...lorebookContent].sort((a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            const formattedEntries = sortedEntries.map(entry => `[World Info]: ${entry.content}`);
            systemPromptParts.push(`[World Info]\n${formattedEntries.join('\n')}`);
        }

        // Memories Injection
        if (relevantMemories.length > 0) {
            const sortedMemories = [...relevantMemories].sort((a, b) =>
                new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
            );
            const memoryText = sortedMemories.map(m => `[Memory]: ${replaceVariables(m.content)}`).join('\n');
            systemPromptParts.push(`[Memories]\n${memoryText}`);
        }

        const systemContent = systemPromptParts.join('\n');

        // --- Llama 3 Formatting ---
        let prompt = `<|start_header_id|>system<|end_header_id|>\n${systemContent}<|eot_id|>`;

        // --- History ---
        if (summary) {
            prompt += `<|start_header_id|>system<|end_header_id|>\n[The Story So Far]\n${summary}<|eot_id|>`;
        }

        // Handle first message (from Character)
        if (history.length === 0 && character.firstMessage) {
            prompt += `<|start_header_id|>user<|end_header_id|>\n${replaceVariables(character.firstMessage)}<|eot_id|>`;
        }

        for (const msg of history) {
            // Invert Roles for History:
            // Real User (You) -> Assistant (in this context, because LLM is playing You)
            // Real Assistant (Char) -> User (in this context)

            // Wait, Llama 3 expects 'assistant' to be the one generating the completion.
            // So if we want LLM to generate 'User' response:
            // The LLM is 'assistant' role in the prompt structure, but we told it "You are User" in system prompt.
            // So:
            // Real User messages -> 'assistant' role in prompt (past things "You" said)
            // Real Character messages -> 'user' role in prompt (things the "User" said to "You")

            const role = msg.role === 'user' ? 'assistant' : 'user';

            // CLEAN CONTENT: Remove image tags and markdown links to prevent hallucinations
            let content = replaceVariables(msg.content)
                .replace(/\[GENERATE_IMAGE:.*?\]/g, '') // Remove generation tags
                .replace(/!\[.*?\]\(.*?\)/g, '')         // Remove markdown images
                .trim();

            if (!content) content = "..."; // Fallback if message was only an image

            if (msg.role === 'assistant') {
                // Character speaking (mapped to 'user' role)
                content = `${charName}: ${content}`;
            }

            prompt += `<|start_header_id|>${role}<|end_header_id|>\n${content}<|eot_id|>`;
        }

        // --- Prime for Generation ---
        // We want the LLM (acting as User/Assistant) to generate.
        prompt += `<|start_header_id|>assistant<|end_header_id|>\n`;

        return { prompt };
    },

    buildLlama3Prompt(
        character: DBCharacter,
        persona: DBPersona | null,
        history: DBMessage[],
        relevantMemories: DBMemory[] = [],
        lorebookContent: { content: string; createdAt: string }[] = [],
        summary: string | null = null,
        linkedCharacter: DBCharacter | null = null,
        responseStyle: 'short' | 'long' = 'long'
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

        const imageGenInstruction = `[IMAGE GENERATION]
You can generate an image to illustrate the current scene, an object, or your appearance. To do this, include the following tag at the end of your response:
[GENERATE_IMAGE: <very detailed visual description of characters, clothing, objects, setting, and lighting>]
Use this feature when the user asks for a picture OR on your own initiative if the moment merits a visual aid (e.g. changing clothes, entering a new location, showing an item). Use commas to separate details and parentheses to group related details. Do not use character names, just use descriptions of their appearance. Do not ask for permission, just do it.
NSFW: NSFW/Smut is allowed.`;

        // Standard Llama 3 System Header
        systemPromptParts.push(`[Main]`);

        // Response Style Selection
        if (responseStyle === 'short') {
            systemPromptParts.push(`You are ${charName}. You are exchanging text messages with ${userName}. Write ${charName}'s next reply. Reply as ${charName} only. Memories of past events and interactions are provided below. Use them to inform your responses. Respond with 2 or 3 sentences. Use emojis to express emotion. Use ellipses (...) for pauses and commas for natural breaks in speech to convey emotion.\n\n${imageGenInstruction}`);
        } else {
            systemPromptParts.push(`You are ${charName}, a roleplay character. You are interacting with ${userName}. Write ${charName}'s next reply in a fictional roleplay. Reply as ${charName} only. Memories of past events and interactions are provided below. Use them to inform your responses. Responses should be short and conversational. Italicize actions and descriptions, and avoid quotation marks. Use markdown. Use ellipses (...) for pauses and commas for natural breaks in speech to convey emotion.\n\n${imageGenInstruction}`);
        }

        // Inject at start if history is short
        if (history.length < 8) {
            systemPromptParts.push(imageGenInstruction);
        }

        // Character Description
        systemPromptParts.push(`[Character Info]`);
        let characterIntro = `${charName} is a ${replaceVariables(character.appearance || '')}. who is ${replaceVariables(character.personality || '')}. ${charName} ${replaceVariables(character.description || '')}`;
        systemPromptParts.push(characterIntro);

        // Persona Description (User) - Now supports Linked Character
        systemPromptParts.push(`[User Persona]`);
        if (linkedCharacter) {
            let userIntro = `${userName} is a ${replaceVariables(linkedCharacter.appearance || '')}. who is ${replaceVariables(linkedCharacter.personality || '')}. ${userName} ${replaceVariables(linkedCharacter.description || '')}`;
            systemPromptParts.push(userIntro);
        } else if (persona) {
            systemPromptParts.push(`Name: ${userName}\n${replaceVariables(persona.description || '')}`);
        } else {
            // Basic User
        }

        // Scenario
        systemPromptParts.push(`[Scenario]`);
        if (character.scenario) {
            systemPromptParts.push(`${replaceVariables(character.scenario)}`);
        }


        // This block was moved/modified above
        // let characterIntro = `${charName} is a ${replaceVariables(character.appearance || '')}. who is ${replaceVariables(character.personality || '')}. ${charName} ${replaceVariables(character.description || '')}`;
        // systemPromptParts.push(characterIntro);

        // This block was moved/modified above
        // if (character.scenario) systemPromptParts.push(`Scenario: ${replaceVariables(character.scenario)}`);

        // Persona injection (This block is now handled by the linkedCharacter/persona logic above)
        // if (persona) {
        //     // User requested specific formatting for persona? They just showed it in the example.
        //     // Let's stick to a simple description for now or append to system.
        //     systemPromptParts.push(`[User Persona]\nName: ${persona.name}\n${replaceVariables(persona.description || '')}`);
        // }

        if (character.systemPrompt) systemPromptParts.push(replaceVariables(character.systemPrompt));

        // Lorebook Injection (World Info)
        if (lorebookContent && lorebookContent.length > 0) {
            // Sort by createdAt ascending (oldest to newest)
            const sortedEntries = [...lorebookContent].sort((a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

            const formattedEntries = sortedEntries.map(entry => {
                const date = new Date(entry.createdAt);
                const now = new Date();
                const diffMs = now.getTime() - date.getTime();

                // Simple relative time formatter
                const diffSec = Math.floor(diffMs / 1000);
                const diffMin = Math.floor(diffSec / 60);
                const diffHour = Math.floor(diffMin / 60);
                const diffDay = Math.floor(diffHour / 24);
                const diffMonth = Math.floor(diffDay / 30);
                const diffYear = Math.floor(diffDay / 365);

                let timeAgo = '';
                if (diffYear > 0) timeAgo = `${diffYear} year${diffYear > 1 ? 's' : ''} ago`;
                else if (diffMonth > 0) timeAgo = `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
                else if (diffDay > 0) timeAgo = `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
                else if (diffHour > 0) timeAgo = `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
                else if (diffMin > 0) timeAgo = `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
                else timeAgo = 'just now';

                return `[${timeAgo}]: ${entry.content}`;
            });

            systemPromptParts.push(`[World Info]\n${formattedEntries.join('\n')}`);
        }

        // Memories Injection
        if (relevantMemories.length > 0) {
            // Sort by createdAt ascending (oldest to newest)
            const sortedMemories = [...relevantMemories].sort((a, b) =>
                new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
            );

            const memoryText = sortedMemories.map(m => {
                // Calculate time ago
                const date = new Date(m.createdAt || new Date());
                const now = new Date();
                const diffMs = now.getTime() - date.getTime();

                const diffSec = Math.floor(diffMs / 1000);
                const diffMin = Math.floor(diffSec / 60);
                const diffHour = Math.floor(diffMin / 60);
                const diffDay = Math.floor(diffHour / 24);

                let timeAgo = '';
                if (diffDay > 0) timeAgo = `${diffDay}d ago`;
                else if (diffHour > 0) timeAgo = `${diffHour}h ago`;
                else if (diffMin > 0) timeAgo = `${diffMin}m ago`;
                else timeAgo = 'just now';

                return `[${timeAgo}] ${replaceVariables(m.content)}`;
            }).join('\n');
            systemPromptParts.push(`[Memories]\n${memoryText}`);
        }

        if (responseStyle === 'short') {
            systemPromptParts.push(`You are ${charName}. Reply as ${charName} only. Responses should be short and concise. Use markdown. Use ellipses (...) for pauses and commas for natural breaks in speech to convey emotion.`);
        } else {
            systemPromptParts.push(`You are ${charName}. Reply as ${charName} only. Italicize actions and descriptions, and avoid quotation marks. Use markdown. Responses should be short and conversational. Use ellipses (...) for pauses and commas for natural breaks in speech to convey emotion.`);
        }
        systemPromptParts.push(`[Begin Roleplay]`);
        const systemContent = systemPromptParts.join('\n');

        // --- Llama 3 Formatting ---
        let prompt = `<|start_header_id|>system<|end_header_id|>\n${systemContent}<|eot_id|>`;

        // --- History ---
        // Inject Summary if exists
        if (summary) {
            prompt += `<|start_header_id|>system<|end_header_id|>\n[The Story So Far]\n${summary}<|eot_id|>`;
        }

        // Handle first message
        if (history.length === 0 && character.firstMessage) {
            prompt += `<|start_header_id|>assistant<|end_header_id|>\n${replaceVariables(character.firstMessage)}<|eot_id|>`;
        }

        for (const [index, msg] of history.entries()) {
            const role = msg.role === 'user' ? 'user' : 'assistant';

            // CLEAN CONTENT: Remove image tags and markdown links to prevent hallucinations
            let content = replaceVariables(msg.content)
                .replace(/\[GENERATE_IMAGE:.*?\]/g, '') // Remove generation tags
                .replace(/!\[.*?\]\(.*?\)/g, '')         // Remove markdown images
                .trim();

            if (!content) content = "..."; // Fallback if message was only an image

            // Add name prefix for User messages to support multi-persona
            if (role === 'user') {
                // Use stored name if available (for history), otherwise current persona name
                const nameToUse = msg.name || userName;
                content = `${nameToUse}: ${content}`;
            }

            prompt += `<|start_header_id|>${role}<|end_header_id|>\n${content}<|eot_id|>`;

            // Inject Image Generation instruction about 4 messages deep in longer chats
            if (history.length >= 5 && index === history.length - 5) {
                prompt += `<|start_header_id|>system<|end_header_id|>\n\n${imageGenInstruction}<|eot_id|>\n\n`;
            }
        }

        // --- Assistant Prime ---
        prompt += `<|start_header_id|>assistant<|end_header_id|>\n`;

        // Calculate breakdown (approximate by character count)
        const memorySize = relevantMemories.reduce((acc, m) => acc + m.content.length, 0);
        const lorebookSize = lorebookContent.reduce((acc, l) => acc + l.content.length, 0);
        const summarySize = summary ? summary.length : 0;
        const historySize = history.reduce((acc, m) => acc + m.content.length, 0);

        // System size is total minus everything else (approx, to account for headers/formatting)
        // Or better: System is the base system content minus the parts we know are memories/lorebooks
        // But since we joined them, it's hard to know exact formatting overhead.
        // Let's rely on the fact that total = prompt.length.
        // And we want the sum of parts to equal total.
        // So System = Total - Memories - Lorebook - Summary - History.
        // This effectively makes "System" the "Everything Else" bucket (headers, system prompt, formatting).
        const totalSize = prompt.length;
        const systemSize = totalSize - memorySize - lorebookSize - summarySize - historySize;

        const breakdown = {
            system: Math.max(0, systemSize), // Ensure non-negative
            memories: memorySize,
            lorebook: lorebookSize,
            history: historySize,
            summary: summarySize,
            total: totalSize
        };

        return { prompt, breakdown };
    }
};
