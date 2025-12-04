import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const characters = sqliteTable('characters', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    avatarPath: text('avatar_path'),
    firstMessage: text('first_message'),
    personality: text('personality'),
    scenario: text('scenario'),
    systemPrompt: text('system_prompt'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const personas = sqliteTable('personas', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    avatarPath: text('avatar_path'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const chatSessions = sqliteTable('chat_sessions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    characterId: integer('character_id').references(() => characters.id).notNull(),
    personaId: integer('persona_id').references(() => personas.id),
    name: text('name'), // Optional custom name for the chat
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const chatMessages = sqliteTable('chat_messages', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    originalContent: text('original_content'), // In case of edits
    promptUsed: text('prompt_used'), // For debugging/logging what was sent to LLM
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const memories = sqliteTable('memories', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    characterId: integer('character_id').references(() => characters.id).notNull(),
    content: text('content').notNull(),
    keywords: text('keywords'), // JSON string or comma-separated
    importance: integer('importance').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(), // JSON string
});
