import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'mellowcake.db');
const db = new Database(dbPath);

console.log('Opening database at:', dbPath);

try {
    console.log('Adding swipes column...');
    db.prepare('ALTER TABLE chat_messages ADD COLUMN swipes TEXT').run();
    console.log('Added swipes column successfully.');
} catch (e: any) {
    console.log('Error adding swipes column (might already exist):', e.message);
}

try {
    console.log('Adding current_index column...');
    db.prepare('ALTER TABLE chat_messages ADD COLUMN current_index INTEGER DEFAULT 0').run();
    console.log('Added current_index column successfully.');
} catch (e: any) {
    console.log('Error adding current_index column (might already exist):', e.message);
}

db.close();
