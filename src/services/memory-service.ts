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

    async generateMemoryFromChat(characterId: number, chatHistory: { role: string, content: string }[]) {
        // Use LLM to summarize and extract memory
        const text = chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');
        const prompt = `Analyze the following chat history and extract a concise memory or fact about the user or the interaction that should be remembered for future context.
        
Rules:
1. Only extract FACTS that are explicitly stated or demonstrated in the conversation.
2. Do NOT infer feelings or thoughts unless explicitly stated.
3. Do NOT make up events that did not happen in the text.
4. If the user mentions a preference (e.g., "I like apples"), record it.
5. If a significant event occurs (e.g., "User found a key"), record it.
6. If nothing important happened, return "NONE".

Chat History:
${text}

Memory:`;

        // We need a model. We can use the default one.
        const models = await llmService.getModels();
        const model = models.length > 0 ? models[0].name : 'llama3:latest';

        const response = await llmService.chat(model, [{ role: 'user', content: prompt }]);

        if (response && !response.includes('NONE')) {
            // Generate keywords
            const keywordPrompt = `Extract 3-5 comma-separated keywords for this memory: "${response}"`;
            const keywordRes = await llmService.chat(model, [{ role: 'user', content: keywordPrompt }]);
            const keywords = keywordRes ? keywordRes.split(',').map((k: string) => k.trim()) : [];

            await this.createMemory(characterId, response, keywords);
            return response;
        }
        return null;
    }
};
