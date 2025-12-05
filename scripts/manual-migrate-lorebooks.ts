import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        await db.run(sql`
            CREATE TABLE IF NOT EXISTS lorebooks (
                id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                name text NOT NULL,
                description text,
                content text,
                created_at text DEFAULT CURRENT_TIMESTAMP,
                updated_at text DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Lorebooks table created successfully.');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

main();
