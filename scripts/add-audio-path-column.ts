import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'mellowcake.db');
const db = new Database(dbPath);

console.log('Opening database at:', dbPath);

try {
    console.log('Adding audio_path column...');
    db.prepare('ALTER TABLE chat_messages ADD COLUMN audio_path TEXT').run();
    console.log('Added audio_path column successfully.');
} catch (e: any) {
    console.log('Error adding audio_path column (might already exist):', e.message);
}

db.close();
