import { db } from '@/lib/db';
import { chatSessions, chatMessages, characters, personas } from '@/lib/db/schema';
import { llmService } from './llm-service';
import { characterService } from './character-service';
import { eq, desc, asc, gte, and } from 'drizzle-orm';

export const chatService = {
    async createSession(characterId: number, personaId?: number, name?: string, lorebooks?: string[], includeFirstMessage: boolean = true) {
        const [session] = await db.insert(chatSessions).values({
            characterId,
            personaId,
            name,
            lorebooks: lorebooks ? JSON.stringify(lorebooks) : undefined,
        }).returning();

        if (includeFirstMessage) {
            const character = await characterService.getById(characterId);
            if (character && character.firstMessage) {
                await this.addMessage(session.id, 'assistant', character.firstMessage, undefined, character.name);
            }
        }

        return [session];
    },

    async updateSession(id: number, data: { name?: string; personaId?: number; lorebooks?: string[] }) {
        const updateData: any = { ...data, updatedAt: new Date().toISOString() };
        if (data.lorebooks) {
            updateData.lorebooks = JSON.stringify(data.lorebooks);
        }
        return await db.update(chatSessions)
            .set(updateData)
            .where(eq(chatSessions.id, id))
            .returning();
    },

    async getSessionById(id: number) {
        const result = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
        return result[0] || null;
    },

    async getSessionsByCharacterId(characterId: number) {
        return await db.select()
            .from(chatSessions)
            .where(eq(chatSessions.characterId, characterId))
            .orderBy(desc(chatSessions.updatedAt));
    },

    async addMessage(sessionId: number, role: 'user' | 'assistant' | 'system', content: string, promptUsed?: string, name?: string) {
        // Update session timestamp
        await db.update(chatSessions)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(chatSessions.id, sessionId));

        return await db.insert(chatMessages).values({
            sessionId,
            role,
            content,
            promptUsed,
            name,
            swipes: JSON.stringify([content]),
            currentIndex: 0,
        }).returning();
    },

    async addSwipe(messageId: number, content: string, promptUsed?: string) {
        const msg = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).get();
        if (!msg) return null;

        const swipes = msg.swipes ? JSON.parse(msg.swipes) : [msg.content];
        swipes.push(content);
        const newIndex = swipes.length - 1;

        return await db.update(chatMessages)
            .set({
                swipes: JSON.stringify(swipes),
                currentIndex: newIndex,
                content: content, // Set current content to the new swipe
                promptUsed: promptUsed || msg.promptUsed
            })
            .where(eq(chatMessages.id, messageId))
            .returning();
    },

    async navigateSwipe(messageId: number, direction: 'left' | 'right') {
        const msg = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).get();
        if (!msg) return null;

        const swipes = msg.swipes ? JSON.parse(msg.swipes) : [msg.content];
        if (swipes.length <= 1) return [msg];

        let newIndex = (msg.currentIndex || 0) + (direction === 'left' ? -1 : 1);

        // Wrap around
        if (newIndex < 0) newIndex = swipes.length - 1;
        if (newIndex >= swipes.length) newIndex = 0;

        return await db.update(chatMessages)
            .set({
                currentIndex: newIndex,
                content: swipes[newIndex]
            })
            .where(eq(chatMessages.id, messageId))
            .returning();
    },

    async deleteSwipe(messageId: number, swipeIndex: number) {
        const msg = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).get();
        if (!msg) return { success: false, deletedMessage: false };

        const swipes = msg.swipes ? JSON.parse(msg.swipes) : [msg.content];

        // If it's the only swipe, delete the message completely
        if (swipes.length <= 1) {
            await this.deleteMessageFrom(messageId);
            return { success: true, deletedMessage: true };
        }

        // Validate index
        if (swipeIndex < 0 || swipeIndex >= swipes.length) {
            return { success: false, error: 'Invalid swipe index' };
        }

        // Remove the swipe at index
        swipes.splice(swipeIndex, 1);

        // Handle Audio Paths
        let audioPaths: string[] = [];
        if (msg.audioPaths) {
            try {
                audioPaths = JSON.parse(msg.audioPaths);
                if (Array.isArray(audioPaths)) {
                    // Remove the corresponding audio path if it exists
                    // Note: audioPaths array might be sparse or shorter than swipes if generation failed
                    if (swipeIndex < audioPaths.length) {
                        audioPaths.splice(swipeIndex, 1);
                    }
                }
            } catch (e) {
                console.error('Error parsing audioPaths during swipe delete:', e);
            }
        }

        // Determine new Current Index
        let newIndex = msg.currentIndex || 0;
        // If we deleted the current or a previous item, we need to adjust or clamp the index
        if (swipeIndex === newIndex) {
            // If we deleted the active one, show the previous one, or 0
            newIndex = Math.max(0, newIndex - 1);
        } else if (swipeIndex < newIndex) {
            // If we deleted one before the current, shift index down
            newIndex--;
        }
        // If we deleted one after, newIndex stays same unless it was out of bounds (handled by clamp logic implicitly if we were careful, but max(0, length-1) is safer)
        if (newIndex >= swipes.length) newIndex = swipes.length - 1;


        const updatedMsg = await db.update(chatMessages)
            .set({
                swipes: JSON.stringify(swipes),
                currentIndex: newIndex,
                content: swipes[newIndex],
                audioPaths: JSON.stringify(audioPaths)
            })
            .where(eq(chatMessages.id, messageId))
            .returning();

        return { success: true, deletedMessage: false, message: updatedMsg[0] };
    },

    async getMessages(sessionId: number) {
        return await db.select()
            .from(chatMessages)
            .where(eq(chatMessages.sessionId, sessionId))
            .orderBy(asc(chatMessages.createdAt)); // Oldest first
    },

    async deleteSession(id: number) {
        return await db.delete(chatSessions).where(eq(chatSessions.id, id));
    },



    async deleteMessageFrom(messageId: number) {
        // 1. Get the message to find its session and creation time/id
        const targetMsg = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).get();
        if (!targetMsg) return false;

        // 2. Delete this message and all subsequent messages in the same session
        // We use ID comparison assuming auto-increment IDs reflect chronological order
        await db.delete(chatMessages)
            .where(and(
                eq(chatMessages.sessionId, targetMsg.sessionId),
                gte(chatMessages.id, messageId)
            ));

        return true;
    },

    async updateSummary(sessionId: number, summary: string) {
        return await db.update(chatSessions)
            .set({ summary, updatedAt: new Date().toISOString() })
            .where(eq(chatSessions.id, sessionId));
    },

    async summarizeHistory(sessionId: number, messagesToSummarize: { role: string, content: string, name?: string | null }[]) {
        if (messagesToSummarize.length === 0) return null;

        const text = messagesToSummarize.map(m => `${m.name || m.role}: ${m.content} `).join('\n');
        const prompt = `Summarize the following chat history into a concise narrative paragraph(3 - 5 sentences) that captures the key events and information. Maintain the style and tone of the story.
        
Chat History:
${text}

Summary: `;

        // Use default model
        const models = await llmService.getModels();
        const model = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno'))?.name || models[0]?.name || 'llama3:latest';

        const summary = await llmService.chat(model, [{ role: 'user', content: prompt }], { temperature: 0.4 });
        return summary;
    },

    async deleteMessages(ids: number[]) {
        if (ids.length === 0) return;
        for (const id of ids) {
            await db.delete(chatMessages).where(eq(chatMessages.id, id));
        }
    }
};
