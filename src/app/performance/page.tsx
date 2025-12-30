'use client';

import { useState, useEffect } from 'react';
import type { PerformanceMetrics } from '@/lib/performance-logger';
import { Logger } from '@/lib/logger';

export default function PerformanceDashboard() {
    const [logs, setLogs] = useState<PerformanceMetrics[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/performance/logs');
                const data = await res.json();
                setLogs(data.logs || []);
            } catch (err) {
                Logger.error('Failed to fetch logs', err);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    // Helper: Calculate Stats
    const calculateStats = () => {
        if (logs.length === 0) return null;

        const totalRequests = logs.length;
        const avgDuration = Math.round(logs.reduce((acc, l) => acc + (l.duration_total_ms || 0), 0) / totalRequests);
        const avgContextUsage = Math.round(logs.reduce((acc, l) => acc + (l.context_usage_pct || 0), 0) / totalRequests);
        const avgMemoryDropRate = Math.round(logs.reduce((acc, l) => acc + (l.context_memories_dropped_pct || 0), 0) / totalRequests);

        return { totalRequests, avgDuration, avgContextUsage, avgMemoryDropRate };
    };

    const stats = calculateStats();

    // Helper: Timeline Bar
    const TimelineBar = ({ log }: { log: PerformanceMetrics }) => {
        const total = log.duration_total_ms || 1;

        const segments = [
            { label: 'Pre', value: log.duration_preprocessing_ms, color: 'bg-blue-500' },
            { label: 'Mem', value: log.duration_memory_search_ms, color: 'bg-green-500' },
            { label: 'Lore', value: log.duration_lore_scan_ms, color: 'bg-yellow-500' },
            { label: 'Ctx', value: log.duration_context_construction_ms, color: 'bg-purple-500' },
            { label: 'LLM', value: log.duration_llm_generation_ms, color: 'bg-red-500' },
            { label: 'Post', value: log.duration_postprocessing_ms, color: 'bg-gray-500' },
        ].filter(s => s.value && s.value > 0);

        return (
            <div className="w-full h-4 bg-gray-700/50 rounded-full overflow-hidden flex mt-2">
                {segments.map((s, idx) => (
                    <div
                        key={idx}
                        className={`${s.color} h-full tooltip-trigger relative hover:opacity-80 transition-opacity`}
                        style={{ width: `${((s.value || 0) / total) * 100}%` }}
                        title={`${s.label}: ${s.value}ms`}
                    />
                ))}
            </div>
        );
    };

    if (loading) return <div className="p-8 text-center text-gray-400">Loading metrics...</div>;

    return (
        <div className="min-h-screen bg-gray-950 text-gray-200 p-8">
            <header className="mb-8 flex justify-between items-center">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                    Performance Metrics
                </h1>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md text-sm transition-colors"
                >
                    Refresh
                </button>
            </header>

            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <Card label="Total Requests" value={stats.totalRequests.toString()} />
                    <Card label="Avg Response Time" value={`${stats.avgDuration}ms`} />
                    <Card label="Avg Context Usage" value={`${stats.avgContextUsage}%`} />
                    <Card label="Avg Memory Drop Rate" value={`${stats.avgMemoryDropRate}%`} />
                </div>
            )}

            <div className="bg-gray-900 rounded-lg p-6 shadow-xl border border-gray-800">
                <h2 className="text-xl font-semibold mb-6 border-b border-gray-800 pb-2">Recent Requests</h2>
                <div className="space-y-6">
                    {logs.map((log, i) => (
                        <div key={i} className="bg-gray-950/50 p-4 rounded-lg border border-gray-800/50 hover:border-gray-700 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-mono text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded border border-blue-500/20">{log.model}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">Session: {log.sessionId}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-bold text-gray-100">{log.duration_total_ms || 0}ms</div>
                                </div>
                            </div>

                            {/* Timeline */}
                            <TimelineBar log={log} />

                            {/* Legend for Timeline */}
                            <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                                <LegendItem label="Pre-process" color="bg-blue-500" value={log.duration_preprocessing_ms} />
                                <LegendItem label="Memory" color="bg-green-500" value={log.duration_memory_search_ms} />
                                <LegendItem label="Lore" color="bg-yellow-500" value={log.duration_lore_scan_ms} />
                                <LegendItem label="Context" color="bg-purple-500" value={log.duration_context_construction_ms} />
                                <LegendItem label="LLM" color="bg-red-500" value={log.duration_llm_generation_ms} />
                                <LegendItem label="Post-process" color="bg-gray-500" value={log.duration_postprocessing_ms} />
                            </div>

                            {/* Detailed Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-800/50 text-sm">
                                <div>
                                    <div className="text-gray-500 text-xs font-semibold mb-1">Context Usage</div>
                                    <div className="font-mono text-gray-300">{(log.context_usage_pct || 0).toFixed(1)}%</div>
                                    <div className="text-gray-600 text-xs mt-1 space-y-0.5">
                                        <div className="flex justify-between"><span>Total:</span> <span>{log.context_usage_total_chars}</span></div>
                                        <div className="flex justify-between"><span>Sys:</span> <span>{log.context_usage_system_chars}</span></div>
                                        <div className="flex justify-between"><span>Hist:</span> <span>{log.context_usage_history_chars}</span></div>
                                        <div className="flex justify-between"><span>Mem:</span> <span>{log.context_usage_memories_chars}</span></div>
                                        <div className="flex justify-between"><span>Lore:</span> <span>{log.context_usage_lore_chars}</span></div>
                                        <div className="flex justify-between"><span>Sum:</span> <span>{log.context_usage_summary_chars}</span></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-500 text-xs font-semibold mb-1">Memories (Search)</div>
                                    <div className="font-mono text-gray-300">
                                        {log.context_memories_total || 0} found
                                    </div>
                                    <div className="text-red-400 text-xs mt-0.5">
                                        {log.context_memories_dropped || 0} dropped ({(log.context_memories_dropped_pct || 0).toFixed(1)}%)
                                    </div>

                                    <div className="text-gray-500 text-xs font-semibold mt-3 mb-1">Memory Scores</div>
                                    <div className="font-mono text-gray-300 text-xs space-y-0.5">
                                        <div className="flex justify-between"><span>Avg:</span> <span>{log.memory_score_avg ?? '-'}</span></div>
                                        <div className="flex justify-between"><span>Range:</span> <span>{log.memory_score_min ?? '-'} - {log.memory_score_max ?? '-'}</span></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-500 text-xs font-semibold mb-1">Memory Age (Hours)</div>
                                    <div className="font-mono text-gray-300 text-xs space-y-0.5">
                                        <div className="flex justify-between"><span>Avg:</span> <span>{log.memory_age_avg_hours ?? '-'}</span></div>
                                        <div className="flex justify-between"><span>Min:</span> <span>{log.memory_age_min_hours ?? '-'}</span></div>
                                        <div className="flex justify-between"><span>Max:</span> <span>{log.memory_age_max_hours ?? '-'}</span></div>
                                    </div>

                                    <div className="text-gray-500 text-xs font-semibold mt-3 mb-1">Lore Age (Hours)</div>
                                    <div className="font-mono text-gray-300 text-xs space-y-0.5">
                                        <div className="flex justify-between"><span>Avg:</span> <span>{log.lore_age_avg_hours ?? '-'}</span></div>
                                        <div className="flex justify-between"><span>Min:</span> <span>{log.lore_age_min_hours ?? '-'}</span></div>
                                        <div className="flex justify-between"><span>Max:</span> <span>{log.lore_age_max_hours ?? '-'}</span></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-500 text-xs font-semibold mb-1">Lore Entries</div>
                                    <div className="font-mono text-gray-300">{log.context_lore_total || 0}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Card({ label, value }: { label: string, value: string }) {
    return (
        <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 shadow-lg">
            <h3 className="text-gray-500 text-sm uppercase tracking-wider mb-2">{label}</h3>
            <div className="text-2xl font-bold text-gray-100">{value}</div>
        </div>
    );
}

function LegendItem({ label, color, value }: { label: string, color: string, value?: number }) {
    if (!value) return null;
    return (
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span>{label} ({value}ms)</span>
        </div>
    );
}
