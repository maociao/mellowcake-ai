import { db } from '../src/lib/db';
import { lorebooks, lorebookEntries } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

async function splitLorebooks() {
    const allBooks = await db.select().from(lorebooks);
    console.log(`Found ${allBooks.length} lorebooks to process.`);

    for (const book of allBooks) {
        // @ts-ignore - content field is technically deprecated in schema but exists in DB
        const rawContent = book.content;
        if (!rawContent) continue;

        try {
            const json = JSON.parse(rawContent);
            const entries = json.entries || {};

            // ST V3 entries is a map { "uid": { ... } }
            // Or sometimes an array? Let's handle both.
            const entryList = Array.isArray(entries) ? entries : Object.values(entries);

            let count = 0;
            for (const entry of entryList as any[]) {
                const comment = entry.comment || entry.label || '';

                // Filter out POPUP
                if (comment.includes('POPUP')) continue;

                await db.insert(lorebookEntries).values({
                    lorebookId: book.id,
                    label: comment,
                    content: entry.content || '',
                    keywords: JSON.stringify(entry.key || []),
                    enabled: entry.enabled !== false,
                });
                count++;
            }
            console.log(`Processed "${book.name}": Created ${count} entries.`);

        } catch (e) {
            console.error(`Failed to parse content for ${book.name}:`, e);
        }
    }
}

splitLorebooks();
