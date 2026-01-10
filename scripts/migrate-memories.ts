
import { db } from '@/lib/db';
import { memories } from '@/lib/db/schema';
import { HindsightClient } from '@vectorize-io/hindsight-client';

async function migrate() {
    console.log("Starting Optimized Memory Migration...");

    // Config
    const SKIP_IDS: number[] = [];
    const CONCURRENCY = 5;
    const TARGET_CHAR_ID = process.argv[2] ? parseInt(process.argv[2]) : null;

    if (TARGET_CHAR_ID) {
        console.log(`Targeting single character: ${TARGET_CHAR_ID}`);
    }

    const hindsightUrl = process.env.HINDSIGHT_API_URL || 'http://localhost:8888';
    const client = new HindsightClient({ baseUrl: hindsightUrl });

    // 1. Get all memories
    // Note: Drizzle returns createdAt as string or Date depending on driver. 
    // We will handle both in processing.
    const allMemories = await db.select().from(memories).orderBy(memories.createdAt);
    console.log(`Found ${allMemories.length} total memories.`);

    // Group memories by character
    const memoriesByCharacter: Record<string, typeof allMemories> = {};
    for (const mem of allMemories) {
        if (!memoriesByCharacter[mem.characterId]) {
            memoriesByCharacter[mem.characterId] = [];
        }
        memoriesByCharacter[mem.characterId].push(mem);
    }

    console.log(`Found ${allMemories.length} memories across ${Object.keys(memoriesByCharacter).length} characters.`);

    let completed = 0;
    let failed = 0;

    // Process each character
    for (const [charId, charMemories] of Object.entries(memoriesByCharacter)) {
        // Filter by target ID if set
        if (TARGET_CHAR_ID && parseInt(charId) !== TARGET_CHAR_ID) {
            continue;
        }

        // Skip characters in the SKIP_IDS list
        if (SKIP_IDS.includes(parseInt(charId))) {
            console.log(`\nSkipping character ${charId} as it's in SKIP_IDS.`);
            continue;
        }

        const bankId = `character_${charId}`;
        console.log(`\nProcessing ${bankId} (${charMemories.length} memories)...`);

        // 1. Clear existing memories in bank
        try {
            console.log(`  Clearing bank ${bankId}...`);
            const deleteRes = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/memories`, {
                method: 'DELETE'
            });
            if (!deleteRes.ok) {
                console.warn(`  Warning: Failed to clear bank ${bankId}: ${deleteRes.status} ${await deleteRes.text()}`);
            } else {
                console.log(`  Bank cleared.`);
            }
        } catch (e) {
            console.warn(`  Warning: Error clearing bank ${bankId}:`, e);
        }

        // 2. Migrate memories
        let charCompleted = 0;
        let charFailed = 0;

        // Process in batches
        for (let i = 0; i < charMemories.length; i += CONCURRENCY) {
            const batch = charMemories.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async (mem) => {
                try {
                    // Ensure timestamp is a Date object
                    // Ensure timestamp is a Date object
                    let timestamp: Date;

                    // Force cast or check string since schema defines it as string|null
                    const rawDate = mem.createdAt as unknown;

                    if (rawDate instanceof Date) {
                        timestamp = rawDate;
                    } else if (typeof rawDate === 'string') {
                        timestamp = new Date(rawDate);
                    } else {
                        timestamp = new Date();
                    }

                    await client.retain(bankId, mem.content, {
                        timestamp: timestamp,
                        metadata: {
                            original_id: mem.id.toString(),
                            migrated: "true"
                        }
                    });
                    process.stdout.write('.');
                    charCompleted++;
                } catch (e) {
                    process.stdout.write('x');
                    charFailed++;
                    // Only log error detail if it's not a common timeout/spam
                    // console.error(`Failed ID ${mem.id}:`, e);
                }
            }));
        }

        console.log(`\n  ${bankId}: ${charCompleted} migrated, ${charFailed} failed.`);
        completed += charCompleted;
        failed += charFailed;
    }

    console.log(`\nMigration Complete: ${completed} migrated, ${failed} failed.`);
}

migrate()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error("Migration failed:", e);
        process.exit(1);
    });
