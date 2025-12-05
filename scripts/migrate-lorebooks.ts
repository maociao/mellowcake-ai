import { db } from '../src/lib/db';
import { lorebooks } from '../src/lib/db/schema';
import { CONFIG } from '../src/config';
import fs from 'fs';
import path from 'path';

const WORLDS_DIR = path.join(CONFIG.SILLYTAVERN_PATH, 'data', 'default-user', 'worlds');

async function migrateLorebooks() {
    if (!fs.existsSync(WORLDS_DIR)) {
        console.log(`Lorebooks directory not found: ${WORLDS_DIR}`);
        return;
    }

    const files = fs.readdirSync(WORLDS_DIR).filter(f => f.endsWith('.json'));
    console.log(`Found ${files.length} lorebooks to migrate.`);

    for (const file of files) {
        try {
            const filePath = path.join(WORLDS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const json = JSON.parse(content);

            const name = file.replace('.json', '');

            // Check if already exists
            const existing = await db.query.lorebooks.findFirst({
                where: (lorebooks, { eq }) => eq(lorebooks.name, name)
            });

            if (existing) {
                console.log(`Lorebook "${name}" already exists, skipping.`);
                continue;
            }

            // Insert
            await db.insert(lorebooks).values({
                name: name,
                description: json.description || '', // Assuming description field exists or empty
                content: content, // Store raw JSON content
            });

            console.log(`Migrated lorebook: ${name}`);

        } catch (e) {
            console.error(`Failed to migrate ${file}:`, e);
        }
    }
}

migrateLorebooks();
