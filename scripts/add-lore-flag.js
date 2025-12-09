const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'mellowcake.db');
const db = new Database(dbPath);

try {
    console.log('Adding is_always_included column to lorebook_entries...');
    db.prepare(`
        ALTER TABLE lorebook_entries 
        ADD COLUMN is_always_included INTEGER DEFAULT 0
    `).run();
    console.log('Successfully added is_always_included column.');
} catch (error) {
    if (error.message.includes('duplicate column name')) {
        console.log('Column is_always_included already exists.');
    } else {
        console.error('Error adding column:', error);
        process.exit(1);
    }
}
