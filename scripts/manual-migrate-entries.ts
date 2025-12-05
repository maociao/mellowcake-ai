import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        await db.run(sql`
            CREATE TABLE IF NOT EXISTS lorebook_entries (
                id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                lorebook_id integer NOT NULL,
                label text,
                content text NOT NULL,
                keywords text,
                enabled integer DEFAULT 1,
                created_at text DEFAULT CURRENT_TIMESTAMP,
                updated_at text DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lorebook_id) REFERENCES lorebooks(id) ON DELETE cascade
            );
        `);
        console.log('Lorebook Entries table created successfully.');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

main();
