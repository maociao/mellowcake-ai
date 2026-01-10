import fs from 'fs';
import path from 'path';

export interface PerformanceMetrics {
    duration_preprocessing_ms?: number;
    duration_memory_search_ms?: number;
    duration_lore_scan_ms?: number;
    duration_context_construction_ms?: number;
    duration_llm_generation_ms?: number;
    duration_postprocessing_ms?: number;
    duration_total_ms?: number;

    context_memories_total?: number;
    context_memories_dropped?: number;
    context_memories_dropped_pct?: number;

    context_lore_total?: number;
    context_lore_dropped?: number;
    context_lore_dropped_pct?: number;

    memory_age_min_hours?: number;
    memory_age_max_hours?: number;
    memory_age_avg_hours?: number;

    memory_score_min?: number;
    memory_score_max?: number;
    memory_score_avg?: number;

    lore_age_min_hours?: number;
    lore_age_max_hours?: number;
    lore_age_avg_hours?: number;

    context_usage_system_chars?: number;
    context_usage_memories_chars?: number;
    context_usage_lore_chars?: number;
    context_usage_history_chars?: number;
    context_usage_summary_chars?: number;
    context_usage_total_chars?: number;
    context_limit_chars?: number;
    context_usage_pct?: number;

    timestamp: string;
    sessionId: string;
    model: string;
}

export class PerformanceLogger {
    private logs: PerformanceMetrics;
    private timers: Map<string, number>;
    private enabled: boolean;
    private logPath: string;

    constructor(sessionId: string, model: string, enabled: boolean = false) {
        this.enabled = enabled;
        this.timers = new Map();
        this.logPath = path.join(process.cwd(), 'performance.log');
        this.logs = {
            timestamp: new Date().toISOString(),
            sessionId,
            model
        };
    }

    startTimer(label: string) {
        if (!this.enabled) return;
        this.timers.set(label, performance.now());
    }

    endTimer(label: string) {
        if (!this.enabled) return;
        const start = this.timers.get(label);
        if (start) {
            const duration = performance.now() - start;
            (this.logs as any)[`duration_${label}_ms`] = Math.round(duration);
        }
    }

    logMetric(key: keyof PerformanceMetrics, value: number | string) {
        if (!this.enabled) return;
        (this.logs as any)[key] = value;
    }

    calculateAgeStats(dates: (string | Date)[], prefix: 'memory' | 'lore') {
        if (!this.enabled || dates.length === 0) return;

        const now = new Date().getTime();
        const ages = dates.map(d => (now - new Date(d).getTime()) / (1000 * 60 * 60)); // Hours

        const min = Math.min(...ages);
        const max = Math.max(...ages);
        const avg = ages.reduce((a, b) => a + b, 0) / ages.length;

        this.logMetric(`${prefix}_age_min_hours` as any, parseFloat(min.toFixed(2)));
        this.logMetric(`${prefix}_age_max_hours` as any, parseFloat(max.toFixed(2)));
        this.logMetric(`${prefix}_age_avg_hours` as any, parseFloat(avg.toFixed(2)));
        this.logMetric(`${prefix}_age_avg_hours` as any, parseFloat(avg.toFixed(2)));
    }

    calculateScoreStats(scores: number[], prefix: 'memory') {
        if (!this.enabled || scores.length === 0) return;

        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

        this.logMetric(`${prefix}_score_min` as any, min);
        this.logMetric(`${prefix}_score_max` as any, max);
        this.logMetric(`${prefix}_score_avg` as any, parseFloat(avg.toFixed(2)));
    }

    flush() {
        if (!this.enabled) return;

        // Calculate total if not set
        if (!this.logs.duration_total_ms && this.logs.duration_preprocessing_ms && this.logs.duration_llm_generation_ms) {
            // Approximation of total specific to our pipeline stages if needed, 
            // but usually we wrap the whole request.
        }

        const logEntry = JSON.stringify(this.logs);

        try {
            fs.appendFileSync(this.logPath, logEntry + '\n');
            console.log(`[PerformanceLogger] Written to ${this.logPath}`);
        } catch (err) {
            console.error('[PerformanceLogger] Failed to write log:', err);
        }
    }
}
