# Development Rules

## Logging
- ALWAYS use the `Logger` class from `@/lib/logger` for all server-side logging.
- DO NOT use `console.log`, `console.error`, or `console.warn` in server-side code (API routes, services, etc.).
- Client-side code should also use `Logger` where possible, or be minimal with `console` usage if `Logger` is not appropriate.
- Use `Logger.info()`, `Logger.error()`, `Logger.warn()`, `Logger.debug()`.
- For LLM prompts/responses, use `Logger.llm()`.
- For ComfyUI workflows, use `Logger.comfy()`.
