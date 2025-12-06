const Database = require('better-sqlite3');
const db = new Database('mellowcake.db');

try {
    db.prepare('ALTER TABLE lorebook_entries ADD COLUMN weight INTEGER DEFAULT 5').run();
    console.log('Successfully added weight to lorebook_entries table');
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log('Column weight already exists');
    } else {
        console.error('Error adding column:', err);
    }
}
