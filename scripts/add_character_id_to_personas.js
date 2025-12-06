const Database = require('better-sqlite3');
const db = new Database('mellowcake.db');

try {
    db.prepare('ALTER TABLE personas ADD COLUMN character_id INTEGER REFERENCES characters(id)').run();
    console.log('Successfully added character_id to personas table');
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log('Column character_id already exists');
    } else {
        console.error('Error adding column:', err);
    }
}
