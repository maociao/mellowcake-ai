import { db } from '@/lib/db';
import { memories } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Logger } from '@/lib/logger';
import { HindsightClient } from '@vectorize-io/hindsight-client';

const hindsightUrl = process.env.HINDSIGHT_API_URL || 'http://localhost:8888';
const client = new HindsightClient({ baseUrl: hindsightUrl });

export const memoryService = {
    async createMemory(characterId: number, content: string) {
        const bankId = `character_${characterId}`;
        try {
            Logger.info(`[Memory Service] Retaining content for bank ${bankId}...`);
            // We use fetch directly for now if client.retain doesn't return the created object with ID
            // But retain usually just accepts. We might need to list or rely on successful insertion.
            // Hindsight retain returns void or success status usually.
            // To get the "created" memory, we can construct a fake one or just return success.
            // However, the UI expects the returned memory to add to the list.
            // Let's assume we return a placeholder with a temporary ID or refetch.
            // BETTER: Return a standard structure.

            await client.retain(bankId, content);

            // Return a mock object so UI updates immediately (eventual consistency)
            return [{
                id: crypto.randomUUID(), // Temporary UUID
                characterId,
                content,

                importance: 1,
                createdAt: new Date().toISOString(),
                score: 1
            }];
        } catch (error) {
            Logger.error(`[Memory Service] Failed to retain memory in Hindsight:`, error);
            throw error;
        }
    },

    async getMemories(characterId: number) {
        return (await this.listMemories(characterId)).memories;
    },

    async listMemories(characterId: number, limit: number = 100, offset: number = 0) {
        const bankId = `character_${characterId}`;
        try {
            // Use fetch to call the list endpoint directly as we know it works
            const response = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/memories/list?limit=${limit}&offset=${offset}`);
            if (!response.ok) {
                if (response.status === 404) return { memories: [], total: 0 }; // Bank might not exist yet
                throw new Error(`Failed to list memories: ${response.statusText}`);
            }
            const data = await response.json();

            // Transform to application Memory format
            // Hindsight list structure: { items: [{ id, text, date, ... }], total, ... }
            const items = data.items || [];
            const total = data.total || items.length;

            const mappedMemories = items.map((m: any) => {
                // Extract document ID from chunk_id if possible (format: bankId_docId_chunkIndex)
                let documentId = undefined;
                if (m.chunk_id) {
                    const parts = m.chunk_id.split('_');
                    if (parts.length >= 3) {
                        // The docId is the second to last part usually, but bankId helps split.
                        // Format: character_4_38caa76a-c982-4353-aa0c-b7bf6eb9593b_0
                        // Parts: "character", "4", "38caa76a-c982-4353-aa0c-b7bf6eb9593b", "0"
                        // Actually "character_4" is bankId.
                        // Let's rely on finding the UUID in the middle.
                        // Or simply use regex to capture the UUID before the final underscore.
                        const match = m.chunk_id.match(/_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_\d+$/);
                        if (match) {
                            documentId = match[1];
                        }
                    }
                }

                return {
                    id: m.id, // UUID string of the memory unit
                    documentId, // UUID string of the source document (for deletion)
                    characterId,
                    content: m.text || m.content,

                    importance: 1,
                    createdAt: m.created_at || m.date || new Date().toISOString(),
                    score: 1
                };
            });

            return { memories: mappedMemories, total };
        } catch (error) {
            Logger.error(`[Memory Service] Failed to list memories for ${bankId}:`, error);
            return { memories: [], total: 0 };
        }
    },

    async searchMemories(characterId: number, query: string, limit: number = 25) {
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

                importance: Math.round((r.score || 0) * 10), // Scale 0-1 to 0-10
                createdAt: r.mentioned_at || r.date || r.created_at || new Date().toISOString(),
                score: r.score || 0
            }));

            return {
                memories: mappedMemories.slice(0, limit),
                total: mappedMemories.length
            };

        } catch (error) {
            Logger.error(`[Memory Service] Hindsight recall failed, returning empty:`, error);
            return { memories: [], total: 0 };
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

    async deleteMemory(characterId: number, documentId: string) {
        const bankId = `character_${characterId}`;
        try {
            Logger.info(`[Memory Service] Deleting document ${documentId} from bank ${bankId}`);
            // Use fetch to delete
            const response = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/documents/${documentId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error(`Failed to delete document: ${response.statusText}`);
            }
            return true;
        } catch (error) {
            Logger.error('[Memory Service] Failed to delete memory:', error);
            throw error;
        }
    },

    async deleteMemoryBank(characterId: number) {
        const bankId = `character_${characterId}`;
        try {
            Logger.info(`[Memory Service] Deleting memory bank ${bankId}...`);
            const response = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}`, {
                method: 'DELETE'
            });
            if (!response.ok && response.status !== 404) {
                throw new Error(`Failed to delete memory bank: ${response.statusText}`);
            }
            return true;
        } catch (error) {
            Logger.error(`[Memory Service] Failed to delete memory bank ${bankId}:`, error);
            // Don't throw, just log. Deleting a character shouldn't fail if bank deletion fails.
            return false;
        }
    },

    async updateMemory(id: string, content: string, keywords: string[]) {
        // Hindsight doesn't support direct update by ID easily yet.
        // Would need delete + add, but we need bankId/characterId context which isn't passed here.
        Logger.warn('[Memory Service] Update memory not supported for Hindsight yet.');
        return [];
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
