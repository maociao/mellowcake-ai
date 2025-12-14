const Database = require('better-sqlite3');
const db = new Database('mellowcake.db');

try {
    db.prepare("ALTER TABLE chat_sessions ADD COLUMN response_style text DEFAULT 'long'").run();
    console.log("Migration successful");
} catch (error) {
    if (error.message.includes("duplicate column name")) {
        console.log("Column already exists");
    } else {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}
