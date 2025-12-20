import { db } from '@/lib/db';
import { characters, chatSessions, chatMessages, memories, characterVideos, personas } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

// Helper to extract PNG metadata (reused logic, but adapted)
function extractPngMetadata(buffer: Buffer): any | null {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.readUInt32BE(0) !== 0x89504E47 || buffer.readUInt32BE(4) !== 0x0D0A1A0A) {
        return null;
    }

    let offset = 8;
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);

        if (type === 'tEXt') {
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;
            const data = buffer.subarray(dataStart, dataEnd);

            const nullIndex = data.indexOf(0);
            if (nullIndex !== -1) {
                const keyword = data.toString('ascii', 0, nullIndex);
                const text = data.toString('utf8', nullIndex + 1);

                if (keyword === 'chara') {
                    try {
                        const decoded = Buffer.from(text, 'base64').toString('utf8');
                        return JSON.parse(decoded);
                    } catch (e) {
                        console.error('Error decoding chara chunk:', e);
                    }
                }
            }
        }
        offset += 12 + length;
    }
    return null;
}

export const characterService = {
    async getAll() {
        // Fetch all characters
        const allChars = await db.select().from(characters);

        // Fetch default videos
        const defaultVideos = await db.query.characterVideos.findMany({
            where: (videos, { eq }) => eq(videos.isDefault, true),
        });
        const videoMap = new Map(defaultVideos.map(v => [v.characterId, v.filePath]));

        // Fetch last interaction time from chat sessions
        const lastInteractions = await db
            .select({
                characterId: chatSessions.characterId,
                lastInteraction: sql<string>`max(${chatSessions.updatedAt})`
            })
            .from(chatSessions)
            .groupBy(chatSessions.characterId);

        const interactionMap = new Map(lastInteractions.map(i => [i.characterId, i.lastInteraction]));

        // Merge and Sort
        const charactersWithMeta = allChars.map(c => ({
            ...c,
            defaultVideoPath: videoMap.get(c.id) || null,
            lastInteraction: interactionMap.get(c.id) || null
        }));

        return charactersWithMeta.sort((a, b) => {
            // 1. Sort by Last Interaction (Desc)
            if (a.lastInteraction && b.lastInteraction) {
                return b.lastInteraction.localeCompare(a.lastInteraction);
            }
            if (a.lastInteraction) return -1;
            if (b.lastInteraction) return 1;

            // 2. Fallback to UpdatedAt (Desc) - for newly created/edited characters
            if (a.updatedAt && b.updatedAt) {
                return b.updatedAt.localeCompare(a.updatedAt);
            }

            // 3. Fallback to ID (Desc) - newest first
            return b.id - a.id;
        });
    },

    async getById(id: number) {
        const char = await db.query.characters.findFirst({
            where: eq(characters.id, id),
            with: {
                // @ts-ignore
                voice: true
            }
        });

        if (char) {
            const defaultVideo = await db.query.characterVideos.findFirst({
                where: (videos, { eq, and }) => and(eq(videos.characterId, id), eq(videos.isDefault, true)),
            });
            return { ...char, defaultVideoPath: defaultVideo?.filePath || null };
        }
        return null;
    },

    async create(data: typeof characters.$inferInsert & { lorebooks?: string[] }) {
        const insertData: any = { ...data };
        if (data.lorebooks) {
            insertData.lorebooks = JSON.stringify(data.lorebooks);
        }
        return (await db.insert(characters).values(insertData).returning())[0];
    },

    async update(id: number, data: Partial<typeof characters.$inferInsert> & { lorebooks?: string[] }) {
        const updateData: any = { ...data };
        if (data.lorebooks) {
            updateData.lorebooks = JSON.stringify(data.lorebooks);
        }
        return (await db.update(characters).set(updateData).where(eq(characters.id, id)).returning())[0];
    },

    async delete(id: number) {
        // 1. Get file paths to delete
        const char = await this.getById(id);
        const videos = await db.query.characterVideos.findMany({
            where: (videos, { eq }) => eq(videos.characterId, id)
        });

        // 2. Cascade Delete in DB
        // Messages are set to cascade delete on session delete in schema?
        // Let's verify schema.
        // chatMessages.sessionId -> chatSessions.id (onDelete: 'cascade') -> YES
        // But chatSessions -> characters is NOT cascade in schema usually unless specified.
        // Let's check schema.ts again or just delete manually to be safe.
        // memories -> characterId
        // characterVideos -> characterId (onDelete: 'cascade') -> YES

        // Note: SQLite foreign keys need to be enabled for ON DELETE CASCADE to work.
        // Drizzle/better-sqlite3 usually enables them if configured?
        // To be safe, let's delete sessions manually or ensure cascade works.
        // If we delete character, and sessions reference it...

        // Let's manually delete to be sure about cleanup
        // Actually, let's just delete related tables first.

        // Delete Videos (DB)
        await db.delete(characterVideos).where(eq(characterVideos.characterId, id));

        // Delete Memories
        await db.delete(memories).where(eq(memories.characterId, id));

        // Delete Sessions (will cascade delete messages)
        await db.delete(chatSessions).where(eq(chatSessions.characterId, id));

        // Delete Personas linked to this character
        await db.delete(personas).where(eq(personas.characterId, id));

        // Finally remove character
        await db.delete(characters).where(eq(characters.id, id));

        // 3. Delete Files
        if (char?.avatarPath && char.avatarPath.startsWith('/')) {
            const avatarFilePath = path.join(process.cwd(), 'public', char.avatarPath);
            if (fs.existsSync(avatarFilePath)) {
                try { fs.unlinkSync(avatarFilePath); } catch (e) { console.error('Failed to delete avatar', e); }
            }
        }

        for (const video of videos) {
            if (video.filePath) {
                const videoPath = path.join(process.cwd(), 'public', video.filePath.startsWith('/') ? video.filePath.slice(1) : video.filePath);
                if (fs.existsSync(videoPath)) {
                    try { fs.unlinkSync(videoPath); } catch (e) { console.error('Failed to delete video file', e); }
                }
            }
        }

        return true;
    },

    async importFromPng(filePath: string) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const buffer = fs.readFileSync(filePath);
        const metadata = extractPngMetadata(buffer);

        if (!metadata) {
            throw new Error('No character metadata found in PNG');
        }

        // Handle V2/V3 structure
        const charData = metadata.data || metadata;

        // Save the image to a local assets folder?
        // For now, we'll just keep the original path or copy it.
        // Let's assume we copy it to public/characters
        const fileName = path.basename(filePath);
        const publicDir = path.join(process.cwd(), 'public', 'characters');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        const newPath = path.join(publicDir, fileName);
        fs.copyFileSync(filePath, newPath);

        const newCharacter = await this.create({
            name: charData.name || fileName.replace('.png', ''),
            description: charData.description || '',
            avatarPath: `/characters/${fileName}`,
            firstMessage: charData.first_mes || '',
            personality: charData.personality || '',
            scenario: charData.scenario || '',
            systemPrompt: charData.system_prompt || '', // Some cards have this
        });

        return newCharacter;
    }
};
