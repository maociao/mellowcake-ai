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
        // Analyze the last 10 messages (approx 3 turns) to capture broader context
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

        const prompt = `Analyze the following RECENT dialogue and determine if there is a NEW, SIGNIFICANT fact about ${personaName} or the relationship that should be committed to long-term memory.

[FORBIDDEN - EXISTING KNOWLEDGE]
(These specific facts are ALREADY KNOWN. Harmonize with them, but NEVER extract them as new memories.)
${existingContext || "None"}

[TARGET FOR EXTRACTION - RECENT DIALOGUE]
(Only extract facts explicitly stated here.)
${text}

[INSTRUCTIONS]
1. IDENTIFY: specific preferences, major events, or permanent facts stated in [TARGET FOR EXTRACTION].
2. VERIFY: Check [FORBIDDEN - EXISTING KNOWLEDGE]. If a fact is listed there, IGNORE IT.
3. RATE IMPORTANCE (1-10):
   - 1-3: Trivial (e.g., "User said hello", "User likes water", "User is tired") -> IGNORE
   - 4-6: Contextual/Temporary (e.g., "User is driving home", "User is eating lunch") -> IGNORE
   - 7-8: Permanent Preference/Fact (e.g., "User has a sister named Sarah", "User hates spicy food") -> SAVE
   - 9-10: Critical/Core Identity (e.g., "User is allergic to peanuts", "User is moving to Japan") -> SAVE
4. OUTPUT FORMAT:
   Return a JSON object: { "memory": "concise sentence", "importance": 8 }
   If nothing meets the criteria (Score < 7) or no new info, return: { "memory": null, "importance": 0 }

[NEGATIVE CONSTRAINTS]
- DO NOT rephrase existing knowledge.
- DO NOT save feelings or temporary states.
- DO NOT save small talk or pleasantries.
- JSON ONLY. No markdown.`;

        // We need a model.
        const models = await llmService.getModels();
        const model = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

        Logger.llm('memory-gen', { prompt, model, temperature: 0.2 }); // Lower temperature for structured output

        try {
            const response = await llmService.chat(model, [{ role: 'user', content: prompt }], {
                temperature: 0.2,
                format: "json"
            });

            if (response) {
                // Parse JSON
                let result;
                try {
                    result = JSON.parse(response);
                } catch (e) {
                    // Fallback if LLM output markdown or extra text
                    const match = response.match(/\{[\s\S]*\}/);
                    if (match) {
                        result = JSON.parse(match[0]);
                    }
                }

                if (result && result.memory && result.importance >= 7 && result.memory !== 'null') {
                    Logger.info(`[Memory Service] Generated High-Value Memory (Score: ${result.importance}): ${result.memory}`);

                    // Generate keywords
                    const keywordPrompt = `Extract 3-5 comma-separated keywords for this memory: "${result.memory}"`;
                    const keywordRes = await llmService.chat(model, [{ role: 'user', content: keywordPrompt }]);
                    const keywords = keywordRes ? keywordRes.split(',').map((k: string) => k.trim()) : [];

                    // Save with Importance
                    return await db.insert(memories).values({
                        characterId,
                        content: result.memory,
                        keywords: JSON.stringify(keywords),
                        importance: result.importance,
                    }).returning();
                } else {
                    Logger.debug(`[Memory Service] No high-value memory found (Result: ${JSON.stringify(result)})`);
                }
            }
        } catch (err) {
            Logger.error('[Memory Service] Error generating memory:', err);
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
