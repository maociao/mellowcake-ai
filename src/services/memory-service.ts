import { db } from '@/lib/db';
import { memories } from '@/lib/db/schema';
import { eq, like, or, desc } from 'drizzle-orm';
import { llmService } from './llm-service';
import { Logger } from '@/lib/logger';

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
        // Fetch all memories for the character
        const allMemories = await this.getMemories(characterId);

        if (allMemories.length === 0) return { memories: [], totalFound: 0 };

        // 1. Scoring: Calculate relevance for ALL memories
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

        const scoredMemories = allMemories.map(mem => ({
            ...mem,
            score: scoreMemory(mem)
        })).filter(mem => mem.score > 0); // STRICT FILTER: match required

        // 2. Sort & Limit
        // Sort by Score (Desc) -> Recency (Desc)
        scoredMemories.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score; // Higher score first
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(); // Newer first
        });

        // Take top N
        return {
            memories: scoredMemories.slice(0, limit),
            totalFound: scoredMemories.length
        };
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

        Logger.llm('memory-gen', { prompt, model, temperature: 0.7 });

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
