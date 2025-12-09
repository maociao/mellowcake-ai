import { db } from '@/lib/db';
import { characters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
        // We want to get the default video path for each character
        // Since we are using drizzle, we can use a left join or a subquery.
        // But for simplicity with the current setup, let's fetch all and then fetch videos or use a raw query if needed.
        // Actually, drizzle's query builder is powerful.
        // Let's use db.query.characters.findMany with with: { videos: ... } if relations were set up.
        // I didn't set up the relation in the schema for characters -> videos yet, only videos -> characters.
        // Let's add the relation first or just do a raw query / manual join.
        // Adding relation to schema is cleaner but requires editing schema again.
        // Let's just do a manual join logic here for now or update schema.
        // Actually, I can just fetch all characters and all default videos and map them.

        const allChars = await db.select().from(characters);
        const defaultVideos = await db.query.characterVideos.findMany({
            where: (videos, { eq }) => eq(videos.isDefault, true),
        });

        const videoMap = new Map(defaultVideos.map(v => [v.characterId, v.filePath]));

        return allChars.map(c => ({
            ...c,
            defaultVideoPath: videoMap.get(c.id) || null,
        }));
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
        return await db.insert(characters).values(insertData).returning();
    },

    async update(id: number, data: Partial<typeof characters.$inferInsert> & { lorebooks?: string[] }) {
        const updateData: any = { ...data };
        if (data.lorebooks) {
            updateData.lorebooks = JSON.stringify(data.lorebooks);
        }
        return await db.update(characters).set(updateData).where(eq(characters.id, id)).returning();
    },

    async delete(id: number) {
        return await db.delete(characters).where(eq(characters.id, id));
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
