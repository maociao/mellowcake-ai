import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Adding summary column to chat_sessions table...');
    try {
        await db.run(sql`ALTER TABLE chat_sessions ADD COLUMN summary text`);
        console.log('Successfully added summary column.');
    } catch (error) {
        console.error('Error adding column:', error);
    }
}

main();
