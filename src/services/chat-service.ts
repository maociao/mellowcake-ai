import { db } from '@/lib/db';
import { chatSessions, chatMessages, characters, personas } from '@/lib/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
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

    async addMessage(sessionId: number, role: 'user' | 'assistant' | 'system', content: string, promptUsed?: string) {
        // Update session timestamp
        await db.update(chatSessions)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(chatSessions.id, sessionId));

        return await db.insert(chatMessages).values({
            sessionId,
            role,
            content,
            promptUsed,
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
    }
};
