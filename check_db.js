const Database = require('better-sqlite3');
const db = new Database('mellowcake.db');
const stmt = db.prepare("PRAGMA table_info(chat_sessions)");
const info = stmt.all();
console.log(info);

const stmt2 = db.prepare("PRAGMA table_info(characters)");
const info2 = stmt2.all();
console.log('Characters:', info2.map(c => c.name));

const stmt3 = db.prepare("PRAGMA table_info(chat_messages)");
const info3 = stmt3.all();
console.log('ChatMessages:', info3.map(c => c.name));
