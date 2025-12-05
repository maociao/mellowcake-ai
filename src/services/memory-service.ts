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

    async searchMemories(characterId: number, query: string, limit: number = 5) {
        // Simple keyword search for now
        // In a real app, we'd use vector search or FTS
        // We'll split query into words and look for matches in content or keywords

        const terms = query.split(' ').filter(t => t.length > 3); // Filter short words
        if (terms.length === 0) return [];

        // Construct OR clauses for each term
        const conditions = terms.map(term =>
            or(
                like(memories.content, `%${term}%`),
                like(memories.keywords, `%${term}%`)
            )
        );

        // Combine with characterId check
        // Drizzle ORM composition might be tricky with dynamic array of conditions
        // Let's just do a simple content search for the whole query string for MVP
        // or fetch all and filter in JS (inefficient but works for small datasets)

        const allMemories = await this.getMemories(characterId);

        // Simple scoring
        const scored = allMemories.map(mem => {
            let score = 0;
            const text = (mem.content + ' ' + (mem.keywords || '')).toLowerCase();
            terms.forEach(term => {
                if (text.includes(term.toLowerCase())) score++;
            });
            return { ...mem, score };
        });

        return scored
            .filter(m => m.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
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
            return `${roleName}: ${m.content}`;
        }).join('\n');

        const existingContext = [
            ...existingMemories.map(m => `- ${m.content}`),
            ...lorebookContent.map(l => `- ${l.content}`)
        ].join('\n');

        const prompt = `Analyze the following RECENT dialogue and extract a NEW concise memory or fact about ${personaName} or the interaction that is NOT already known.

Existing Knowledge (Do NOT repeat these):
${existingContext || "None"}

Recent Dialogue:
${text}

Rules:
1. Only extract NEW FACTS explicitly stated in the Recent Dialogue.
2. Do NOT repeat facts from Existing Knowledge.
3. Do NOT infer feelings or thoughts unless explicitly stated.
4. If nothing NEW and IMPORTANT happened, return "NONE".
5. Keep the memory concise (1 sentence).

Memory:`;

        // We need a model. We can use the default one.
        const models = await llmService.getModels();
        const model = models.find(m => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

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
