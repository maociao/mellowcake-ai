import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Adding name column to chat_messages table...');
    try {
        await db.run(sql`ALTER TABLE chat_messages ADD COLUMN name text`);
        console.log('Successfully added name column.');
    } catch (error) {
        console.error('Error adding column (might already exist):', error);
    }
}

main();
