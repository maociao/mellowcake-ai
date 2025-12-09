import { db } from '@/lib/db';
import { lorebooks, lorebookEntries } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export const lorebookService = {
    async getAll() {
        return await db.select().from(lorebooks).orderBy(desc(lorebooks.updatedAt));
    },

    async getById(id: number) {
        const book = await db.select().from(lorebooks).where(eq(lorebooks.id, id)).get();
        if (!book) return null;

        const entries = await db.select().from(lorebookEntries).where(eq(lorebookEntries.lorebookId, id));
        return { ...book, entries };
    },

    async create(data: { name: string; description?: string }) {
        const [newBook] = await db.insert(lorebooks).values(data).returning();
        return { ...newBook, entries: [] };
    },

    async update(id: number, data: { name?: string; description?: string }) {
        await db.update(lorebooks)
            .set({ ...data, updatedAt: new Date().toISOString() })
            .where(eq(lorebooks.id, id));
        return this.getById(id);
    },

    async delete(id: number) {
        return await db.delete(lorebooks).where(eq(lorebooks.id, id));
    },

    // Entry Management
    async addEntry(lorebookId: number, data: { label?: string; content: string; keywords?: string; enabled?: boolean; isAlwaysIncluded?: boolean }) {
        return await db.insert(lorebookEntries).values({
            lorebookId,
            ...data
        }).returning();
    },

    async updateEntry(id: number, data: Partial<typeof lorebookEntries.$inferInsert>) {
        return await db.update(lorebookEntries)
            .set({ ...data, updatedAt: new Date().toISOString() })
            .where(eq(lorebookEntries.id, id))
            .returning();
    },

    async deleteEntry(id: number) {
        return await db.delete(lorebookEntries).where(eq(lorebookEntries.id, id));
    },

    async getAlwaysIncluded(lorebookNames: string[]) {
        if (!lorebookNames || lorebookNames.length === 0) return [];

        const books = await db.query.lorebooks.findMany({
            where: (lorebooks, { inArray }) => inArray(lorebooks.name, lorebookNames),
            with: {
                entries: {
                    where: (entries, { and, eq }) => and(
                        eq(entries.enabled, true),
                        eq(entries.isAlwaysIncluded, true)
                    )
                }
            }
        });

        const matches: { content: string; createdAt: string; weight: number }[] = [];
        for (const book of books) {
            for (const entry of book.entries) {
                matches.push({
                    content: entry.content,
                    createdAt: entry.createdAt || new Date().toISOString(),
                    weight: (entry as any).weight || 5
                });
            }
        }
        return matches;
    },

    async scan(text: string, lorebookNames: string[], limit: number = 5) {
        if (!lorebookNames || lorebookNames.length === 0) return [];

        // 1. Get IDs for names
        const books = await db.query.lorebooks.findMany({
            where: (lorebooks, { inArray }) => inArray(lorebooks.name, lorebookNames),
            with: {
                entries: {
                    where: (entries, { and, eq, ne }) => and(
                        eq(entries.enabled, true),
                        // Exclude always included entries from search to avoid duplicates
                        ne(entries.isAlwaysIncluded, true)
                    )
                }
            }
        });

        const matches: { content: string; createdAt: string; weight: number }[] = [];
        const lowerText = text.toLowerCase();

        for (const book of books) {
            for (const entry of book.entries) {
                try {
                    const keywords = JSON.parse(entry.keywords || '[]');
                    if (Array.isArray(keywords)) {
                        // Check if any keyword is in text (Whole Word Match)
                        const isMatch = keywords.some(k => {
                            if (!k) return false;
                            // Escape special regex characters in keyword
                            const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                            return regex.test(text);
                        });
                        if (isMatch) {
                            matches.push({
                                content: entry.content,
                                createdAt: entry.createdAt || new Date().toISOString(),
                                weight: (entry as any).weight || 5
                            });
                        }
                    }
                } catch (e) {
                    console.error(`Error parsing keywords for entry ${entry.id}:`, e);
                }
            }
        }

        // Sort by Weight DESC, then CreatedAt DESC (Newer first)
        matches.sort((a, b) => {
            if (a.weight !== b.weight) {
                return b.weight - a.weight; // Higher weight first
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Newer first
        });

        return matches.slice(0, limit);
    }
};
