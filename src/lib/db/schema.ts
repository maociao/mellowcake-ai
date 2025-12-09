import { sql, relations } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const voices = sqliteTable('voices', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    filePath: text('file_path').notNull(),
    transcript: text('transcript'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});



export const characters = sqliteTable('characters', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    avatarPath: text('avatar_path'),
    firstMessage: text('first_message'),
    personality: text('personality'),
    scenario: text('scenario'),
    systemPrompt: text('system_prompt'),
    lorebooks: text('lorebooks'), // JSON string array of names
    voiceId: integer('voice_id').references(() => voices.id),
    voiceSample: text('voice_sample'), // Deprecated: Path to reference audio file
    voiceSampleText: text('voice_sample_text'), // Deprecated: Transcript of the reference audio
    voiceSpeed: real('voice_speed').default(1.0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const charactersRelations = relations(characters, ({ one }) => ({
    voice: one(voices, {
        fields: [characters.voiceId],
        references: [voices.id],
    }),
}));

export const personas = sqliteTable('personas', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    avatarPath: text('avatar_path'),
    characterId: integer('character_id').references(() => characters.id), // Optional link to a character for shared memories
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const chatSessions = sqliteTable('chat_sessions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    characterId: integer('character_id').references(() => characters.id).notNull(),
    personaId: integer('persona_id').references(() => personas.id),
    name: text('name'), // Optional custom name for the chat
    summary: text('summary'), // Summarized history
    lorebooks: text('lorebooks'), // JSON string array of names (overrides character default)
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
    name: text('name'), // Name of the sender at the time of the message (for multi-persona history)
    swipes: text('swipes'), // JSON string array of alternative contents
    currentIndex: integer('current_index').default(0),
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

export const lorebooks = sqliteTable('lorebooks', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    content: text('content'), // Deprecated, but needed for migration
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const lorebookEntries = sqliteTable('lorebook_entries', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lorebookId: integer('lorebook_id').references(() => lorebooks.id, { onDelete: 'cascade' }).notNull(),
    label: text('label'), // from 'comment'
    content: text('content').notNull(),
    keywords: text('keywords'), // JSON string array
    weight: integer('weight').default(5), // Priority 1-10
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    isAlwaysIncluded: integer('is_always_included', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const lorebooksRelations = relations(lorebooks, ({ many }) => ({
    entries: many(lorebookEntries),
}));

export const lorebookEntriesRelations = relations(lorebookEntries, ({ one }) => ({
    lorebook: one(lorebooks, {
        fields: [lorebookEntries.lorebookId],
        references: [lorebooks.id],
    }),
}));

export const characterVideos = sqliteTable('character_videos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    characterId: integer('character_id').references(() => characters.id, { onDelete: 'cascade' }).notNull(),
    filePath: text('file_path').notNull(),
    promptId: text('prompt_id'),
    isDefault: integer('is_default', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
