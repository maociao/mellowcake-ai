export const CONFIG = {
    OLLAMA_URL: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    COMFY_URL: process.env.COMFY_URL || 'http://127.0.0.1:8188',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_LLM_PROMPTS: process.env.LOG_LLM_PROMPTS === 'true',
    LOG_COMFY_WORKFLOWS: process.env.LOG_COMFY_WORKFLOWS === 'true',
};
