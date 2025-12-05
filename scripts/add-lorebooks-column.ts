import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function migrate() {
    console.log('Adding lorebooks column to characters...');
    try {
        await db.run(sql`ALTER TABLE characters ADD COLUMN lorebooks text`);
        console.log('Success.');
    } catch (e: any) {
        if (e.message.includes('duplicate column name')) {
            console.log('Column already exists.');
        } else {
            console.error('Error:', e);
        }
    }

    console.log('Adding lorebooks column to chat_sessions...');
    try {
        await db.run(sql`ALTER TABLE chat_sessions ADD COLUMN lorebooks text`);
        console.log('Success.');
    } catch (e: any) {
        if (e.message.includes('duplicate column name')) {
            console.log('Column already exists.');
        } else {
            console.error('Error:', e);
        }
    }
}

migrate();
