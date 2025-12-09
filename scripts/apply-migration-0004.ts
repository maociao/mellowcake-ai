
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'mellowcake.db');
const db = new Database(DB_PATH);

const migrationPath = path.join(process.cwd(), 'drizzle', '0004_complete_cerebro.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

const statements = sql.split('--> statement-breakpoint');

console.log('Applying migration 0004...');
for (const stmt of statements) {
    if (stmt.trim()) {
        console.log(`Executing: ${stmt.trim().substring(0, 50)}...`);
        db.exec(stmt);
    }
}
console.log('Migration applied.');
