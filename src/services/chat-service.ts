import { db } from '@/lib/db';
import { chatSessions, chatMessages, characters, personas } from '@/lib/db/schema';
import { llmService } from './llm-service';
import { characterService } from './character-service';
import { eq, desc, asc, gte, and, sql } from 'drizzle-orm';
import { memoryService } from './memory-service';
import { lorebookService } from './lorebook-service';
import { personaService } from './persona-service';
import { Logger } from '@/lib/logger';
import { CONFIG } from '@/config';

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
            if (character) {
                let initialMessage = character.firstMessage;

                if ((character as any).autoGenerateIntro) { // Cast as any until types are fully updated everywhere
                    initialMessage = await this.generateIntroMessage(character, personaId);
                }

                if (initialMessage) {
                    await this.addMessage(session.id, 'assistant', initialMessage, undefined, character.name);
                }
            }
        }

        return [session];
    },

    async generateIntroMessage(character: any, personaId?: number): Promise<string> {
        try {
            let userName = 'User';
            let contextMemories = '';

            if (personaId) {
                const persona = await personaService.getById(personaId);
                if (persona) {
                    userName = persona.name;
                    // Fetch memories relevant to this persona
                    const searchResult = await memoryService.searchMemories(character.id, userName, 5);
                    if (searchResult && searchResult.memories.length > 0) {
                        contextMemories = searchResult.memories.map((m: any) => `- ${m.content}`).join('\n');
                    }
                }
            }

            const prompt = `You are ${character.name}.
Description: ${character.description}
Personality: ${character.personality}
Scenario: ${character.scenario || 'You are starting a conversation.'}

You are beginning a new chat with ${userName}.
${contextMemories ? `Here are some things you remember about ${userName}:\n${contextMemories}` : ''}

Task: Write an engaging opening message to start this conversation. Be true to your personality and the current scenario. Use ${userName}'s name if appropriate. Keep it to 1-2 sentences.`;

            const response = await llmService.chat(CONFIG.OLLAMA_CHAT_MODEL, [{ role: 'system', content: prompt }]);
            return response || character.firstMessage || `Hello ${userName}.`; // Fallback

        } catch (error) {
            Logger.error('Failed to auto-generate intro message:', error);
            return character.firstMessage || 'Hello.';
        }
    },

    async updateSession(id: number, data: { name?: string; personaId?: number; lorebooks?: string[]; responseStyle?: 'short' | 'long'; shortTemperature?: number; longTemperature?: number; autoplay?: boolean }) {
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
        // Update session timestamp & increment user turn count
        const updateData: any = { updatedAt: new Date().toISOString() };

        if (role === 'user') {
            updateData.userTurnCount = sql`${chatSessions.userTurnCount} + 1`;
        }

        await db.update(chatSessions)
            .set(updateData)
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

    async updateMessageContent(messageId: number, newContent: string) {
        const msg = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).get();
        if (!msg) return null;

        const swipes = msg.swipes ? JSON.parse(msg.swipes) : [msg.content];
        const currentIndex = msg.currentIndex || 0;

        // Update the specific swipe if index is valid
        if (currentIndex >= 0 && currentIndex < swipes.length) {
            swipes[currentIndex] = newContent;
        } else {
            // Fallback: If index is weird, just push or reset? 
            // Better to assume if we are updating content, we update the active one.
            // If empty, init it.
            if (swipes.length === 0) swipes.push(newContent);
            else swipes[0] = newContent;
        }

        return await db.update(chatMessages)
            .set({
                content: newContent,
                swipes: JSON.stringify(swipes),
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
                Logger.error('Error parsing audioPaths during swipe delete:', e);
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

        // 2. Count how many USER messages are being deleted (for rewind logic)
        const messagesToDelete = await db.select().from(chatMessages)
            .where(and(
                eq(chatMessages.sessionId, targetMsg.sessionId),
                gte(chatMessages.id, messageId)
            ));

        const userMessagesDeleted = messagesToDelete.filter(m => m.role === 'user').length;

        // 3. Delete this message and all subsequent messages in the same session
        await db.delete(chatMessages)
            .where(and(
                eq(chatMessages.sessionId, targetMsg.sessionId),
                gte(chatMessages.id, messageId)
            ));

        // 4. Decrement userTurnCount if user messages were deleted
        if (userMessagesDeleted > 0) {
            await db.update(chatSessions)
                .set({ userTurnCount: sql`MAX(0, ${chatSessions.userTurnCount} - ${userMessagesDeleted})` })
                .where(eq(chatSessions.id, targetMsg.sessionId));

            Logger.info(`[Chat Service] Rewound ${userMessagesDeleted} user turns. Adjusted turn count.`);
        }

        return true;
    },

    async updateSummary(sessionId: number, summary: string) {
        return await db.update(chatSessions)
            .set({ summary, updatedAt: new Date().toISOString() })
            .where(eq(chatSessions.id, sessionId));
    },

    async summarizeHistory(sessionId: number, messagesToSummarize: { role: string, content: string, name?: string | null }[]) {
        if (messagesToSummarize.length === 0) return null;

        const text = messagesToSummarize.map(m => {
            // Clean content: Remove [GENERATE_IMAGE:...] and ![...](...)
            const cleanedContent = m.content
                .replace(/\[GENERATE_IMAGE:.*?\]/g, '')
                .replace(/!\[.*?\]\(.*?\)/g, '')
                .trim();
            if (!cleanedContent) return null; // Skip if empty after cleaning (e.g. was just an image)
            return `${m.name || m.role}: ${cleanedContent} `;
        }).filter(Boolean).join('\n');

        if (!text) return null;

        const prompt = `Summarize the following chat history into a concise narrative paragraph(3 - 5 sentences) that captures the key events and information. Maintain the style and tone of the story.
        
Chat History:
${text}

Summary: `;

        // Use default model
        // Use configured model
        const model = CONFIG.OLLAMA_CHAT_MODEL;

        const summary = await llmService.chat(model, [{ role: 'user', content: prompt }], { temperature: 0.4 });
        return summary;
    },

    async deleteMessages(ids: number[]) {
        if (ids.length === 0) return;
        for (const id of ids) {
            await db.delete(chatMessages).where(eq(chatMessages.id, id));
        }
    },

    /**
     * Helper to generate a reflection via Hindsight and save it to the Lorebook.
     */
    async generateSessionReflection(sessionId: number) {
        try {
            const session = await this.getSessionById(sessionId);
            if (!session) throw new Error('Session not found');

            const character = await characterService.getById(session.characterId);
            if (!character) throw new Error('Character not found');

            let userName = 'User';
            let linkedCharacter = null;

            if (session.personaId) {
                const persona = await personaService.getById(session.personaId);
                if (persona) {
                    userName = persona.name;
                    // Check for Linked Character
                    if ((persona as any).characterId && (persona as any).characterId !== character.id) {
                        linkedCharacter = await characterService.getById((persona as any).characterId);
                    }
                }
            }

            // --- 1. Assistant Reflection ---
            await this.performReflection(character, userName, session.lorebooks || undefined);

            // --- 2. Linked Character (Impersonated) Reflection ---
            if (linkedCharacter) {
                Logger.info(`[Chat Service] Triggering Linked Character Reflection for ${linkedCharacter.name} (Impersonating User)...`);
                // For the linked character, the "User" they are talking to is the Assistant (character.name)
                // And their "lorebooks" are their own defaults (since session lorebooks usually belong to the assistant/world)
                await this.performReflection(linkedCharacter, character.name, undefined);
            }

            return { success: true };

        } catch (err: any) {
            Logger.error(`[Chat Service] Failed to generate/save reflection:`, err);
            return { success: false, error: err.message };
        }
    },

    /**
     * Private helper to execute the reflection logic for a single entity
     */
    async performReflection(subjectCharacter: any, counterpartyName: string, overrideLorebooks?: string) {
        try {
            // Determine lorebooks
            let lorebooks: string[] = [];
            if (overrideLorebooks) {
                try {
                    lorebooks = JSON.parse(overrideLorebooks);
                } catch (e) {
                    Logger.error('[Chat Service] Failed to parse override lorebooks', e);
                }
            } else if (subjectCharacter.lorebooks) {
                try {
                    lorebooks = JSON.parse(subjectCharacter.lorebooks);
                } catch (e) {
                    Logger.error('[Chat Service] Failed to parse character lorebooks', e);
                }
            }

            if (!lorebooks || lorebooks.length === 0) {
                Logger.info(`[Chat Service] No lorebooks linked to ${subjectCharacter.name}. Skipping reflection.`);
                return;
            }

            Logger.info(`[Chat Service] Generating reflection for ${subjectCharacter.name} (Counterparty: ${counterpartyName})...`);

            const reflectionQuery = `Based on the recent interaction with ${counterpartyName}, reflect on any changes in my opinions about people, places, or perspectives. Have I learned anything new that changes my worldview or relationships? Summarize these insights specifically for my long-term memory using third person perspective.`;

            const reflection = await memoryService.reflect(subjectCharacter.id, reflectionQuery);

            let reflectionText: string | null = null;
            if (reflection) {
                if (typeof reflection === 'string') reflectionText = reflection;
                else if (typeof reflection === 'object') {
                    if ('content' in reflection) reflectionText = (reflection as any).content;
                    else if ('text' in reflection) reflectionText = (reflection as any).text;
                    else reflectionText = JSON.stringify(reflection);
                }
            }

            if (reflectionText) {
                Logger.info(`[Chat Service] Reflection generated for ${subjectCharacter.name}. Extracting keywords...`);

                // Separate Low-Temp Call for Keywords
                let keywords: string[] = ['summary', 'reflection', 'memory'];
                try {
                    const keywordPrompt = `Analyze the following text and extract 3-5 relevant keywords or tags. Return ONLY the keywords as a comma-separated list, nothing else. Do not number them.
                    
    Text:
    "${reflectionText}"`;

                    const keywordRaw = await llmService.generate(
                        CONFIG.OLLAMA_CHAT_MODEL,
                        keywordPrompt,
                        { temperature: 0.1, stop: ['\n'] }
                    );

                    const extracted = keywordRaw.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                    if (extracted.length > 0) {
                        keywords = [...keywords, ...extracted];
                    }
                } catch (tagErr) {
                    Logger.warn(`[Chat Service] Failed to extract keywords, using defaults.`, tagErr);
                }

                // Target the first available Lorebook (usually the primary one)
                // Use the FIRST lorebook in the list.
                const targetBookName = lorebooks[0];
                const targetBook = await lorebookService.getByName(targetBookName);

                if (targetBook) {
                    await lorebookService.addEntry(targetBook.id, {
                        label: 'Periodic Reflection',
                        content: reflectionText,
                        keywords: JSON.stringify(keywords),
                        weight: 5,
                        enabled: true,
                        isAlwaysIncluded: false // Let it be dynamic
                    });
                    Logger.info(`[Chat Service] Saved reflection to Lorebook "${targetBookName}" for ${subjectCharacter.name}`);
                } else {
                    Logger.warn(`[Chat Service] Could not find Lorebook "${targetBookName}" to save reflection.`);
                }
            } else {
                Logger.info(`[Chat Service] No reflection generated for ${subjectCharacter.name}.`);
            }
        } catch (err) {
            Logger.error(`[Chat Service] Error reflecting for ${subjectCharacter.name}:`, err);
        }
    }
};
