# Mellowcake AI - Project Context & Rules

## Project Overview
Mellowcake AI is a sophisticated AI character chat application built as a Progressive Web App (PWA). It integrates:
- **LLM**: Ollama for character roleplay.
- **Memory**: **Hindsight** (Graph+Vector) for persistent, human-like memory.
- **Voice**: F5-TTS for high-quality speech synthesis (configured for AMD ROCm, adaptable for others).
- **Visuals**: ComfyUI for generating character images and videos dynamically.
- **World Building**: A Lorebook system for context-aware injections.

## Technology Stack
- **Framework**: Next.js 16 (App Router)
- **Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: SQLite (via `better-sqlite3`)
- **Memory Engine**: Hindsight (Python/FastAPI)
- **ORM**: Drizzle ORM
- **State Management**: Zustand
- **PWA**: @ducanh2912/next-pwa

## Project Structure
- `src/app`: Next.js App Router pages and API routes.
- `src/components`: React UI components.
- `src/lib`: Core logic, database configuration, authentication, and utilities.
  - `src/lib/db/schema.ts`: **Source of Truth for Database Schema.**
  - `src/lib/logger.ts`: **Source of Truth for Logging.**
- `src/services`: Client-side service layers for API interaction.
- `hindsight_service/`: Hindsight memory engine (FastAPI).
- `drizzle/`: Database migration files.
- `scripts/`: Utilities (`migrate-memories.ts`, `manage-memories.ts`, `sync-banks.ts`).
- `tts_service/`: Python-based F5-TTS server.

## Development Rules

### 1. Logging
**Strictly Enforced**: High-quality logging is essential for debugging this multi-service architecture.
- **Server-Side**: NEVER use `console.log`, `console.error`, or `console.warn`.
  - **ALWAYS** use the `Logger` class from `@/lib/logger`.
  - usage: `Logger.info('Context', 'Message', { metadata })`
- **Client-Side**: Use `Logger` where possible. Minimal `console` usage is permitted only for temporary debugging but should be cleaned up.
- **Specialized Methods**:
  - `Logger.llm()`: For all input/output to Ollama.
  - `Logger.comfy()`: For ComfyUI workflow events.
  - `Logger.db()`: For critical database operations.

### 2. Database & Schema
- **ORM**: Drizzle ORM is used for all database interactions.
- **Schema File**: `src/lib/db/schema.ts` defines the structure.
- **Changes**:
  1. Modify `src/lib/db/schema.ts`.
  2. Run `npx drizzle-kit migrate` or `npx drizzle-kit push` (for dev prototyping).
- **Core Tables**:
  - `characters`, `personas`, `chat_sessions`, `chat_messages` (Chat Loop)
  - `voices` (TTS)
  - `lorebooks`, `lorebook_entries` (World Info)
  - `memories` (Legacy/Staging for Hindsight)

### 3. Coding Standards
- **Components**:
  - Default to **Server Components**.
  - Use `"use client"` only when interactivity (hooks, event listeners) is required.
- **Styling**:
  - Use **Tailwind CSS v4** classes. Avoid custom CSS files unless absolutely necessary for complex animations.
- **State**:
  - Use **Zustand** for global client-side state (e.g., settings, active UI states).
- **Type Safety**:
  - Strict TypeScript usage. Avoid `any`. Define interfaces for all component props and API responses.

### 4. Application Architecture
- **Chat Loop**: The core loop involves fetching chat history -> assembling context (System Prompt + Lore + Hindsight Memory) -> sending to Ollama -> streaming response -> generating TTS/Images in background (optional).
- **Service Isolation**: The Next.js app acts as the orchestrator.
  - **Ollama**: External service.
  - **Hindsight**: Memory Service (port 8888).
  - **F5-TTS**: External Python service (port 8000).
  - **ComfyUI**: External service (port 8188).
  - Code interacting with these services must handle timeouts and connection failures gracefully.

### 5. File & Directory naming
- **React Components**: PascalCase (e.g., `ChatWindow.tsx`).
- **Utilities/Functions**: camelCase (e.g., `formatDate.ts`).
- **Directories**: kebab-case (e.g., `src/components/chat-ui`).
