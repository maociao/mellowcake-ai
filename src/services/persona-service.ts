import { db } from '@/lib/db';
import { personas } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export const personaService = {
    async getAll() {
        return await db.select().from(personas);
    },

    async getById(id: number) {
        const result = await db.select().from(personas).where(eq(personas.id, id));
        return result[0] || null;
    },

    async create(data: typeof personas.$inferInsert) {
        return await db.insert(personas).values(data).returning();
    },

    async update(id: number, data: Partial<typeof personas.$inferInsert>) {
        return await db.update(personas).set(data).where(eq(personas.id, id)).returning();
    },

    async delete(id: number) {
        return await db.delete(personas).where(eq(personas.id, id));
    },

    async importFromPath(filePath: string, name?: string, description?: string) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileName = path.basename(filePath);
        const publicDir = path.join(process.cwd(), 'public', 'personas');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        const newPath = path.join(publicDir, fileName);
        fs.copyFileSync(filePath, newPath);

        const newPersona = await this.create({
            name: name || fileName.replace(/\.(png|jpg|jpeg|webp)$/i, ''),
            description: description || '',
            avatarPath: `/personas/${fileName}`,
        });

        return newPersona;
    }
};
