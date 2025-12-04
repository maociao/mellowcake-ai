import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';

// Ensure the database file exists in a persistent location
// We'll use the project root for now, or a specific data directory
const DB_PATH = path.join(process.cwd(), 'mellowcake.db');

const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite, { schema });
