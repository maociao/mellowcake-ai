const Database = require('better-sqlite3');
const db = new Database('mellowcake.db');

try {
    console.log('Adding voice_sample column...');
    db.prepare('ALTER TABLE characters ADD COLUMN voice_sample text').run();
    console.log('Success.');
} catch (e) {
    console.log('Error adding voice_sample (might already exist):', e.message);
}

try {
    console.log('Adding voice_sample_text column...');
    db.prepare('ALTER TABLE characters ADD COLUMN voice_sample_text text').run();
    console.log('Success.');
} catch (e) {
    console.log('Error adding voice_sample_text (might already exist):', e.message);
}

db.close();
