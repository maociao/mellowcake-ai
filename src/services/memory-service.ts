import { db } from '@/lib/db';
import { memories } from '@/lib/db/schema';
import { eq, like, or, desc } from 'drizzle-orm';
import { llmService } from './llm-service';

export const memoryService = {
    async createMemory(characterId: number, content: string, keywords: string[] = []) {
        return await db.insert(memories).values({
            characterId,
            content,
            keywords: JSON.stringify(keywords),
            importance: 1, // Default importance
        }).returning();
    },

    async getMemories(characterId: number) {
        return await db.select()
            .from(memories)
            .where(eq(memories.characterId, characterId))
            .orderBy(desc(memories.createdAt));
    },

    async searchMemories(characterId: number, query: string, limit: number = 10) {
        // Fetch all memories for the character first
        // Optimization: In a real app with thousands of memories, we would want to do this filtering in SQL.
        // For now, fetching all is acceptable as per previous implementation patterns.
        const allMemories = await this.getMemories(characterId);

        // 1. Identification: Split into Recent vs Old
        // Sort by CreatedAt Descending (Newest first)
        const sortedByRecency = [...allMemories].sort((a, b) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );

        // Always take top 5 recent memories
        const RECENT_COUNT = 5;
        const recentMemories = sortedByRecency.slice(0, RECENT_COUNT);
        const olderMemories = sortedByRecency.slice(RECENT_COUNT);

        // 2. Scoring: Calculate relevance for ALL memories (to help with final sorting)
        const terms = query.split(' ').filter(t => t.length > 3);

        const scoreMemory = (mem: typeof allMemories[0]) => {
            if (terms.length === 0) return 0;
            let score = 0;
            const text = (mem.content + ' ' + (mem.keywords || '')).toLowerCase();
            terms.forEach(term => {
                if (text.includes(term.toLowerCase())) score++;
            });
            return score;
        };

        // Score the older memories to find the best remaining ones
        const scoredOlder = olderMemories.map(mem => ({
            ...mem,
            score: scoreMemory(mem)
        }));

        // Filter valid matches from older memories (must have score > 0)
        const relevantOlder = scoredOlder
            .filter(m => m.score > 0)
            .sort((a, b) => b.score - a.score);

        // 3. Combination
        // We have recentMemories (must include) and relevantOlder (candidates)
        // We need to fill up to 'limit'

        // Convert recent to scored format for consistency
        const scoredRecent = recentMemories.map(mem => ({
            ...mem,
            score: scoreMemory(mem)
        }));

        const finalSelection = [...scoredRecent];

        // Fill remaining slots
        const slotsRemaining = limit - finalSelection.length;
        if (slotsRemaining > 0) {
            finalSelection.push(...relevantOlder.slice(0, slotsRemaining));
        }

        // 4. Final Sort for specific ordering if needed by caller, 
        // though typically caller re-sorts. We'll return them roughly sorted by score then date.
        return finalSelection.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
    },

    async generateMemoryFromChat(
        characterId: number,
        chatHistory: { role: string, content: string, name?: string | null }[],
        existingMemories: { content: string }[] = [],
        lorebookContent: { content: string }[] = [],
        personaName: string = 'User',
        characterName: string = 'Assistant'
    ) {
        // Only analyze the last 6 messages (approx 3 turns) to capture the context of the new memory
        const recentMessages = chatHistory.slice(-6);
        const text = recentMessages.map(m => {
            // Use the stored name in the message if available, otherwise fallback to current persona/character name
            const roleName = m.name ? m.name : (m.role === 'user' ? personaName : characterName);

            // Clean content: Remove [GENERATE_IMAGE:...] and ![...](...)
            const cleanedContent = m.content
                .replace(/\[GENERATE_IMAGE:.*?\]/g, '')
                .replace(/!\[.*?\]\(.*?\)/g, '')
                .trim();

            if (!cleanedContent) return null;

            return `${roleName}: ${cleanedContent}`;
        }).filter(Boolean).join('\n');

        const existingContext = [
            ...existingMemories.map(m => `- ${m.content}`),
            ...lorebookContent.map(l => `- ${l.content}`)
        ].join('\n');

        const prompt = `Analyze the following RECENT dialogue and extract a NEW concise memory or fact about ${personaName} or the interaction that is NOT already known.

[FORBIDDEN - EXISTING KNOWLEDGE]
(These specific facts are ALREADY KNOWN. Harmonize with them, but NEVER extract them as new memories.)
${existingContext || "None"}

[TARGET FOR EXTRACTION - RECENT DIALOGUE]
(Only extract facts explicitly stated here.)
${text}

[INSTRUCTIONS]
1. EXTRACT: specific preferences, events, or facts stated in [TARGET FOR EXTRACTION].
2. VERIFY: Check [FORBIDDEN - EXISTING KNOWLEDGE]. If a fact is listed there, IGNORE IT.
3. OUTPUT: concise, single-sentence memory.
4. If nothing NEW is found, return "NONE".

[NEGATIVE CONSTRAINTS]
- DO NOT rephrase existing knowledge as a new memory.
- DO NOT infer feelings or states (e.g. "User is happy") unless explicitly stated.
- DO NOT include timestamps or "Recently...".

Memory:`;

        // We need a model. We can use the default one.
        const models = await llmService.getModels();
        const model = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

        console.log('[Memory Service] Generating memory with model:', model);
        console.log('[Memory Service] Temperature: 0.7');
        console.log('[Memory Service] Prompt:\n', prompt);

        const response = await llmService.chat(model, [{ role: 'user', content: prompt }], { temperature: 0.7 });

        if (response && !response.includes('NONE')) {
            // Generate keywords
            const keywordPrompt = `Extract 3-5 comma-separated keywords for this memory: "${response}"`;
            const keywordRes = await llmService.chat(model, [{ role: 'user', content: keywordPrompt }]);
            const keywords = keywordRes ? keywordRes.split(',').map((k: string) => k.trim()) : [];

            await this.createMemory(characterId, response, keywords);
            return response;
        }
        return null;
    },
    async deleteMemory(id: number) {
        return await db.delete(memories).where(eq(memories.id, id)).returning();
    },

    async updateMemory(id: number, content: string, keywords: string[]) {
        return await db.update(memories)
            .set({
                content,
                keywords: JSON.stringify(keywords)
            })
            .where(eq(memories.id, id))
            .returning();
    }
};
