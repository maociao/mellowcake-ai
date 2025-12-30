# Development Rules

## Logging
- ALWAYS use the `Logger` class from `@/lib/logger` for all server-side logging.
- DO NOT use `console.log`, `console.error`, or `console.warn` in server-side code (API routes, services, etc.).
- Client-side code should also use `Logger` where possible, or be minimal with `console` usage if `Logger` is not appropriate.
- Use `Logger.info()`, `Logger.error()`, `Logger.warn()`, `Logger.debug()`.
- For LLM prompts/responses, use `Logger.llm()`.
- For ComfyUI workflows, use `Logger.comfy()`.

## Database Schema

**Technology Stack**: SQLite with Drizzle ORM.
**Database File**: `mellowcake.db` (root directory).
**Schema Definition**: `src/lib/db/schema.ts`.

### Tables
- **`voices`**: TTS voice definitions (`id`, `name`, `file_path`, `transcript`).
- **`characters`**: Character entities (`id`, `name`, `description`, `appearance`, `personality`, `voice_id` FK).
- **`personas`**: User personas (`id`, `name`, `character_id` FK).
- **`chat_sessions`**: Chat containers (`id`, `character_id` FK, `persona_id` FK, `summary`).
- **`chat_messages`**: Chat history (`session_id` FK, `role`, `content`, `swipes`, `audio_paths`).
    *   `session_id` has `ON DELETE CASCADE`.
- **`memories`**: Long-term character memory (`character_id` FK, `content`).
- **`lorebooks`**: World info definitions (`id`, `name`, `description`).
- **`lorebook_entries`**: Specific lore entries (`lorebook_id` FK, `content`, `keywords`).
- **`character_videos`**: Associated videos (`character_id` FK, `file_path`).
- **`settings`**: Key-value store (`key`, `value`).

### Migrations
- Run `npx drizzle-kit migrate` to apply changes from `drizzle/` folder.
- Run `npx drizzle-kit push` to push schema changes directly (dev only).
