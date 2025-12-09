
import { db } from '../src/lib/db';
import { characters, voices } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

// Standalone migration script
// Usage: npx tsx scripts/migrate-voices.ts

async function migrate() {
    console.log('Starting voice migration...');

    const allCharacters = await db.select().from(characters);
    console.log(`Found ${allCharacters.length} characters.`);

    const voicesDir = path.join(process.cwd(), 'voices');
    if (!fs.existsSync(voicesDir)) {
        fs.mkdirSync(voicesDir, { recursive: true });
    }

    // Identify public/voices to copy from if needed
    const publicVoicesDir = path.join(process.cwd(), 'public', 'voices');

    for (const char of allCharacters) {
        if (!char.voiceSample) continue;

        const filename = path.basename(char.voiceSample);
        let srcPath = path.join(voicesDir, filename);

        // Check if file exists in voices/
        if (!fs.existsSync(srcPath)) {
            // Check public/voices
            const publicPath = path.join(publicVoicesDir, filename);
            if (fs.existsSync(publicPath)) {
                console.log(`Copying voice for ${char.name} from public/voices...`);
                fs.copyFileSync(publicPath, srcPath);
            } else {
                console.warn(`Voice file not found for ${char.name}: ${filename}`);
                continue;
            }
        }

        // Check if voice entry already exists (deduplication by filename)
        let voiceEntry = await db.query.voices.findFirst({
            where: (voices, { eq }) => eq(voices.filePath, filename)
        });

        if (!voiceEntry) {
            console.log(`Creating voice entry for ${char.name}...`);
            const inserted = await db.insert(voices).values({
                name: `${char.name}'s Voice`,
                filePath: filename
            }).returning();
            voiceEntry = inserted[0];
        } else {
            console.log(`Voice entry already exists for ${filename}`);
        }

        // Link character to voice
        await db.update(characters)
            .set({ voiceId: voiceEntry.id })
            .where(eq(characters.id, char.id));

        console.log(`Linked ${char.name} to voice ID ${voiceEntry.id}`);
    }

    console.log('Migration complete.');
}

migrate().catch(console.error);
