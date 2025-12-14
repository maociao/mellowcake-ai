const Database = require('better-sqlite3');
const db = new Database('mellowcake.db');

try {
    db.prepare("ALTER TABLE chat_sessions ADD COLUMN short_temperature REAL").run();
    console.log("Added short_temperature");
} catch (error) {
    console.log("short_temperature might already exist or error:", error.message);
}

try {
    db.prepare("ALTER TABLE chat_sessions ADD COLUMN long_temperature REAL").run();
    console.log("Added long_temperature");
} catch (error) {
    console.log("long_temperature might already exist or error:", error.message);
}
