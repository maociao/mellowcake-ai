import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'mellowcake.db');
const db = new Database(dbPath);

console.log('Opening database at:', dbPath);

try {
    console.log('Adding audio_paths column...');
    db.prepare('ALTER TABLE chat_messages ADD COLUMN audio_paths TEXT').run();
    console.log('Added audio_paths column successfully.');
} catch (e: any) {
    if (e.message.includes('duplicate column')) {
        console.log('audio_paths column already exists.');
    } else {
        console.error('Error adding audio_paths column:', e.message);
    }
}

try {
    console.log('Migrating existing audio_path data to audio_paths...');
    const rows = db.prepare('SELECT id, audio_path FROM chat_messages WHERE audio_path IS NOT NULL').all();

    let migratedCount = 0;
    const updateStmt = db.prepare('UPDATE chat_messages SET audio_paths = ? WHERE id = ?');

    // Begin transaction
    db.transaction(() => {
        for (const row of rows as any[]) {
            if (row.audio_path) {
                // Initial migration: create array with the single existing path
                const audioPaths = JSON.stringify([row.audio_path]);
                updateStmt.run(audioPaths, row.id);
                migratedCount++;
            }
        }
    })();

    console.log(`Migrated ${migratedCount} rows.`);

} catch (e: any) {
    console.error('Error during data migration:', e.message);
}

try {
    // Note: SQLite support for DROP COLUMN is available in newer versions. 
    // If it fails, we keep the column, it's harmless.
    console.log('Attempting to drop legacy audio_path column...');
    db.prepare('ALTER TABLE chat_messages DROP COLUMN audio_path').run();
    console.log('Dropped audio_path column successfully.');
} catch (e: any) {
    console.log('Could not drop audio_path column (might not be supported or busy):', e.message);
    console.log('Ignoring drop column error, proceeded with migration.');
}

db.close();
