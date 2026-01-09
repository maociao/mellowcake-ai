import { db } from '@/lib/db';
import { memories } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Logger } from '@/lib/logger';
import { HindsightClient } from '@vectorize-io/hindsight-client';

const hindsightUrl = process.env.HINDSIGHT_API_URL || 'http://localhost:8888';
const client = new HindsightClient({ baseUrl: hindsightUrl });

export const memoryService = {
    async createMemory(characterId: number, content: string, keywords: string[] = []) {
        const bankId = `character_${characterId}`;
        try {
            // Push to Hindsight
            Logger.info(`[Memory Service] Retaining content for bank ${bankId}...`);
            await client.retain(bankId, content);
        } catch (error) {
            Logger.error(`[Memory Service] Failed to retain memory in Hindsight:`, error);
        }

        // Keep local copy for UI management
        return await db.insert(memories).values({
            characterId,
            content,
            keywords: JSON.stringify(keywords),
            importance: 1,
        }).returning();
    },

    async getMemories(characterId: number) {
        return await db.select()
            .from(memories)
            .where(eq(memories.characterId, characterId))
            .orderBy(desc(memories.createdAt));
    },

    async searchMemories(characterId: number, query: string, limit: number = 10) {
        const bankId = `character_${characterId}`;
        try {
            Logger.info(`[Memory Service] Recalling from bank ${bankId} with query: "${query}"`);
            const results = await client.recall(bankId, query) as any;

            // Transform Hindsight results to match Application's memory structure
            // Hindsight result structure presumed: { text: string, score: number, metadata: any }
            // If results is an object with a property (e.g. data or memories), we handle it.
            let items: any[] = [];
            if (Array.isArray(results)) {
                items = results;
            } else if (results && Array.isArray(results.results)) {
                items = results.results;
            } else if (results && Array.isArray(results.memories)) {
                items = results.memories; // Possible fallback based on Hindsight API versions
            } else {
                Logger.warn(`[Memory Service] Unexpected recall format:`, results);
            }

            const mappedMemories = items.map((r: any) => ({
                id: -1, // No ID for remote memories
                characterId,
                content: r.text || r.content, // Handle potential API variations
                keywords: JSON.stringify([]),
                importance: Math.round((r.score || 0) * 10), // Scale 0-1 to 0-10
                createdAt: r.mentioned_at || r.date || r.created_at || new Date().toISOString(),
                score: r.score
            }));

            return {
                memories: mappedMemories.slice(0, limit),
                totalFound: mappedMemories.length
            };

        } catch (error) {
            Logger.error(`[Memory Service] Hindsight recall failed, fetching local only fallback:`, error);
            // Fallback to local fetch (non-semantic)
            const localMemories = await this.getMemories(characterId);
            const mappedLocal = localMemories.map(m => ({
                id: m.id,
                characterId: m.characterId,
                content: m.content,
                keywords: m.keywords || '[]',
                importance: m.importance ?? 1,
                createdAt: m.createdAt ?? new Date().toISOString(),
                score: 0
            }));
            return { memories: mappedLocal.slice(0, limit), totalFound: localMemories.length };
        }
    },

    async generateMemoryFromChat(
        characterId: number,
        chatHistory: { role: string, content: string, name?: string | null }[],
        existingMemories: { content: string }[] = [], // Unused in new flow
        lorebookContent: { content: string }[] = [], // Unused in new flow
        personaName: string = 'User',
        characterName: string = 'Assistant'
    ) {
        const bankId = `character_${characterId}`;

        // Extract recent user messages or significant interaction
        const recentMessages = chatHistory.slice(-4);
        const textToAnalyze = recentMessages.map(m => {
            const roleName = m.name ? m.name : (m.role === 'user' ? personaName : characterName);
            return `${roleName}: ${m.content}`;
        }).join('\n');

        if (!textToAnalyze) return null;

        Logger.info(`[Memory Service] Auto-retaining chat context for ${bankId}`);

        try {
            await client.retain(bankId, textToAnalyze, {
                context: "chat_history",
                timestamp: new Date()
            });
            return true;
        } catch (error) {
            Logger.error('[Memory Service] Error auto-retaining memory:', error);
            return null;
        }
    },

    async reflect(characterId: number, query: string) {
        const bankId = `character_${characterId}`;
        try {
            Logger.info(`[Memory Service] Reflecting on bank ${bankId}...`);
            return await client.reflect(bankId, query);
        } catch (error) {
            Logger.error('[Memory Service] Reflection failed:', error);
            return null;
        }
    },

    async deleteMemory(id: number) {
        // Only deletes local copy. Hindsight deletion not supported via ID yet.
        return await db.delete(memories).where(eq(memories.id, id)).returning();
    },

    async updateMemory(id: number, content: string, keywords: string[]) {
        // Only updates local copy. 
        return await db.update(memories)
            .set({
                content,
                keywords: JSON.stringify(keywords)
            })
            .where(eq(memories.id, id))
            .returning();
    },

    /**
     * Ensures a Hindsight memory bank exists for the character, configured with their personality.
     */
    async ensureMemoryBank(character: { id: number; name: string; personality: string; description: string }) {
        const bankId = `character_${character.id}`;

        try {
            // Check if bank exists by getting profile
            // Note: Hindsight client throws 404 if not found (usually)
            try {
                await client.getBankProfile(bankId);
                // If found, we might want to update it, but for now let's assume existence is enough.
                // Or we can blindly re-create/update to ensure settings match current character state.
                Logger.info(`[Memory Service] Updating existing bank ${bankId}...`);
            } catch (e) {
                Logger.info(`[Memory Service] Creating new bank ${bankId}...`);
            }

            // Generate dispositions from LLM
            const dispositions = await this.generateDispositions(character.personality, character.description);

            // Create or Update Bank
            await client.createBank(bankId, {
                name: character.name,
                background: character.description, // 'description' is Background Story
                disposition: dispositions
            });

            Logger.info(`[Memory Service] Bank ${bankId} configured successfully.`);

        } catch (error) {
            Logger.error(`[Memory Service] Failed to ensure/create memory bank:`, error);
        }
    },

    async generateDispositions(personality: string, background: string) {
        try {
            const prompt = `
            Analyze the following character personality and background story to determine their cognitive dispositions on a scale of 1 to 5.
            
            Character Personality: ${personality}
            Character Background: ${background}

            Output ONLY a JSON object with integer values (1-5) for these keys:
            - skepticism (1=gullible, 5=highly skeptical)
            - literalism (1=metaphorical/abstract, 5=very literal)
            - empathy (1=cold/detached, 5=highly empathetic)

            Example: {"skepticism": 3, "literalism": 2, "empathy": 4}
            `;

            // Circular dependency avoidance: Import llmService dynamically if possible, or assume it's available.
            // But we are in services layer. Let's import at top of file.
            // Since we can't easily edit top of file with this chunk, we'll use a dynamic import or assuming 'llmService' is imported.
            // Actually, I need to add the import separately or in this block if lucky. 
            // I will use dynamic import here to be safe and avoid multi-chunk complexity for now.

            const { llmService } = await import('./llm-service');
            const response = await llmService.generate('llama3.1', prompt, { format: 'json', temperature: 0.1 });

            let result = { skepticism: 3, literalism: 3, empathy: 3 }; // defaults
            try {
                const parsed = JSON.parse(response);
                if (parsed.skepticism) result.skepticism = Math.max(1, Math.min(5, parseInt(parsed.skepticism)));
                if (parsed.literalism) result.literalism = Math.max(1, Math.min(5, parseInt(parsed.literalism)));
                if (parsed.empathy) result.empathy = Math.max(1, Math.min(5, parseInt(parsed.empathy)));
            } catch (e) {
                Logger.warn('[Memory Service] Failed to parse generated dispositions, using defaults.', e);
            }
            return result;
        } catch (e) {
            Logger.error('[Memory Service] Failed to generate dispositions:', e);
            return { skepticism: 3, literalism: 3, empathy: 3 };
        }
    }
};
