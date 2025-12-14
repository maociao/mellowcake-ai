const Database = require('better-sqlite3');
const db = new Database('mellowcake.db');

const stmt = db.prepare("SELECT id, name, response_style FROM chat_sessions LIMIT 5");
const rows = stmt.all();
console.log(rows);
