
import { db } from '@/lib/db';
import { characters } from '@/lib/db/schema';
import { memoryService } from '@/services/memory-service';

async function main() {
    console.log("Starting Bank Sync for existing characters...");

    // 1. Fetch all characters
    const allChars = await db.select().from(characters);
    console.log(`Found ${allChars.length} characters.`);

    let success = 0;
    let fail = 0;

    for (const char of allChars) {
        console.log(`\nProcessing Character: ${char.name} (ID: ${char.id})...`);

        // Ensure required fields are present (schema update made them not null, but checking just in case of runtime weirdness or old data in memory)
        if (!char.personality || !char.description) {
            console.warn(`  [SKIP] Missing personality or description for ${char.name}. Please update manually.`);
            fail++;
            continue;
        }

        try {
            await memoryService.ensureMemoryBank({
                id: char.id,
                name: char.name,
                personality: char.personality,
                description: char.description
            });
            console.log(`  [OK] Bank synced for ${char.name}.`);
            success++;
        } catch (e) {
            console.error(`  [ERROR] Failed to sync bank for ${char.name}:`, e);
            fail++;
        }
    }

    console.log(`\nSync Complete. Success: ${success}, Failed/Skipped: ${fail}`);
}

main().catch(console.error);
