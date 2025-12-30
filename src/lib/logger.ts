import { CONFIG } from '@/config';

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'all';

const LEVELS: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    all: 4
};

export class Logger {
    private static get currentLevel(): number {
        const level = (CONFIG.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
        return LEVELS[level] ?? LEVELS.info;
    }

    private static shouldLog(level: LogLevel): boolean {
        return LEVELS[level] <= this.currentLevel;
    }

    static error(message: string, ...args: any[]) {
        if (this.shouldLog('error')) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }

    static warn(message: string, ...args: any[]) {
        if (this.shouldLog('warn')) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }

    static info(message: string, ...args: any[]) {
        if (this.shouldLog('info')) {
            console.log(`[INFO] ${message}`, ...args);
        }
    }

    static debug(message: string, ...args: any[]) {
        if (this.shouldLog('debug')) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }

    /**
     * Specialized logger for LLM Prompts and Responses.
     * Only logs if LOG_LLM_PROMPTS is enabled in config.
     */
    static llm(label: string, data: any) {
        if (CONFIG.LOG_LLM_PROMPTS) {
            console.log(`[LLM:${label}]`, JSON.stringify(data, null, 2));
        }
    }

    /**
     * Specialized logger for ComfyUI Workflows.
     * Only logs if LOG_COMFY_WORKFLOWS is enabled in config.
     */
    static comfy(label: string, workflow: any) {
        if (CONFIG.LOG_COMFY_WORKFLOWS) {
            console.log(`[COMFY:${label}]`, JSON.stringify(workflow, null, 2));
        }
    }
}
