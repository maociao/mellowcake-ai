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
        return await db.select().from(characters);
    },

    async getById(id: number) {
        const result = await db.select().from(characters).where(eq(characters.id, id));
        return result[0] || null;
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
