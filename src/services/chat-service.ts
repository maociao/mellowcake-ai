import { db } from '@/lib/db';
import { chatSessions, chatMessages, characters, personas } from '@/lib/db/schema';
import { llmService } from './llm-service';
import { eq, desc, asc, gte, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export const chatService = {
    async createSession(characterId: number, personaId?: number, name?: string, lorebooks?: string[]) {
        return await db.insert(chatSessions).values({
            characterId,
            personaId,
            name,
            lorebooks: lorebooks ? JSON.stringify(lorebooks) : undefined,
        }).returning();
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
        }).returning();
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

    // Import from SillyTavern JSONL
    async importFromST(filePath: string, characterId: number, personaId?: number) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim() !== '');

        if (lines.length === 0) return null;

        // First line is metadata
        let metadata: any = {};
        try {
            metadata = JSON.parse(lines[0]);
        } catch (e) {
            console.warn('Failed to parse metadata line, skipping import of metadata');
        }

        const sessionName = path.basename(filePath).replace('.jsonl', '');

        // Create session
        const [session] = await this.createSession(characterId, personaId, sessionName);

        // Process messages (skip first line)
        const messages = lines.slice(1);
        for (const line of messages) {
            try {
                const msg = JSON.parse(line);
                const role = msg.is_user ? 'user' : 'assistant';
                await this.addMessage(session.id, role, msg.mes, msg.prompt);
            } catch (e) {
                console.error('Error parsing message line:', e);
            }
        }

        return session;
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

        const text = messagesToSummarize.map(m => `${m.name || m.role}: ${m.content}`).join('\n');
        const prompt = `Summarize the following chat history into a concise narrative paragraph (3-5 sentences) that captures the key events and information. Maintain the style and tone of the story.
        
Chat History:
${text}

Summary:`;

        // Use default model
        const models = await llmService.getModels();
        const model = models.length > 0 ? models[0].name : 'llama3:latest';

        const summary = await llmService.chat(model, [{ role: 'user', content: prompt }]);
        return summary;
    },

    async deleteMessages(ids: number[]) {
        if (ids.length === 0) return;
        // Drizzle doesn't support 'inArray' easily with delete without importing 'inArray' helper
        // Let's import 'inArray' or just loop for now if small, but 'inArray' is better.
        // I need to check imports.
        // Actually, let's just use a raw loop or try to import inArray in next step if needed.
        // Wait, I can import inArray at the top of the file.
        // But I am in a replace_file_content block.
        // I'll just use a loop for safety for now as it's only 10 items.
        for (const id of ids) {
            await db.delete(chatMessages).where(eq(chatMessages.id, id));
        }
    }
};
