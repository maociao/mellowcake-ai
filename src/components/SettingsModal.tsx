'use client';

import { useSettingsStore } from '@/lib/store/settings-store';
import { useState, useEffect } from 'react';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const settings = useSettingsStore();
    const [services, setServices] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetch('/api/services/status')
                .then(res => res.json())
                .then(data => setServices(data.services))
                .catch(err => {
                    console.error('Failed to fetch status:', err);
                    setServices([
                        { name: 'Mellowcake AI', status: 'offline' },
                        { name: 'Ollama', status: 'offline' },
                        { name: 'Hindsight', status: 'offline' },
                        { name: 'F5-TTS', status: 'offline' },
                        { name: 'ComfyUI', status: 'offline' }
                    ]);
                });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white">Settings & Status</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Service Status */}
                    <div className="p-4 bg-gray-700/50 rounded-lg space-y-3">
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">System Status</h3>
                        <div className="space-y-2">
                            {services.map((service) => (
                                <div key={service.name} className="flex justify-between items-center">
                                    <span className="text-sm text-gray-300">{service.name}</span>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${service.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <span className={`text-xs ${service.status === 'online' ? 'text-green-400' : 'text-red-400'}`}>
                                            {service.status === 'online' ? 'Online' : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {services.length === 0 && (
                                <div className="text-center text-xs text-gray-500 py-2">Loading status...</div>
                            )}
                        </div>
                    </div>

                    <hr className="border-gray-700" />

                    {/* Global Generation Defaults */}
                    <div className="p-4 bg-gray-700/50 rounded-lg space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">LLM Parameters</h3>
                            <HelpTooltip text="Configure advanced language model parameters to control creativity and response style." />
                        </div>

                        {/* Global Short Temp */}
                        <div>
                            <div className="flex justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium text-gray-300">Global Short Temp</label>
                                    <HelpTooltip text="Controls creativity for short, punchy responses. Lower values are more deterministic." />
                                </div>
                                <span className="text-sm text-blue-400">{settings.defaultShortTemperature ?? 0.7}</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="2.0"
                                step="0.05"
                                value={settings.defaultShortTemperature ?? 0.7}
                                onChange={(e) => settings.updateSettings({ defaultShortTemperature: parseFloat(e.target.value) })}
                                className="w-full"
                            />
                        </div>

                        {/* Global Long Temp */}
                        <div>
                            <div className="flex justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium text-gray-300">Global Long Temp</label>
                                    <HelpTooltip text="Controls creativity for longer, storytelling responses. Slightly higher values often work better for narrative flow." />
                                </div>
                                <span className="text-sm text-blue-400">{settings.defaultLongTemperature ?? 1.12}</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="2.0"
                                step="0.05"
                                value={settings.defaultLongTemperature ?? 1.12}
                                onChange={(e) => settings.updateSettings({ defaultLongTemperature: parseFloat(e.target.value) })}
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* Temperature */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-300">Temperature</label>
                                <HelpTooltip text="The main control for randomness. Higher (1.0+) is more creative/chaotic, lower (0.1-0.7) is more logical/focused." />
                            </div>
                            <span className="text-sm text-blue-400">{settings.temperature}</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="2.0"
                            step="0.05"
                            value={settings.temperature}
                            onChange={(e) => settings.updateSettings({ temperature: parseFloat(e.target.value) })}
                            className="w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Controls randomness. Higher is more creative.</p>
                    </div>

                    {/* Top P */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-300">Top P</label>
                                <HelpTooltip text="Nucleus Sampling. Considers the top tokens whose probabilities add up to P. Lower values (e.g. 0.9) exclude unlikely words." />
                            </div>
                            <span className="text-sm text-blue-400">{settings.top_p}</span>
                        </div>
                        <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.05"
                            value={settings.top_p}
                            onChange={(e) => settings.updateSettings({ top_p: parseFloat(e.target.value) })}
                            className="w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Nucleus sampling. Lower is more focused.</p>
                    </div>

                    {/* Top K */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-300">Top K</label>
                                <HelpTooltip text="Hard limit on vocabulary. Only considers the top K most likely words for each step." />
                            </div>
                            <span className="text-sm text-blue-400">{settings.top_k}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={settings.top_k}
                            onChange={(e) => settings.updateSettings({ top_k: parseInt(e.target.value) })}
                            className="w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Limits vocabulary to top K words.</p>
                    </div>

                    {/* Min P */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-300">Min P</label>
                                <HelpTooltip text="Sets a minimum probability threshold relative to the most likely token. Helps remove nonsensical options." />
                            </div>
                            <span className="text-sm text-blue-400">{settings.min_p}</span>
                        </div>
                        <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.01"
                            value={settings.min_p}
                            onChange={(e) => settings.updateSettings({ min_p: parseFloat(e.target.value) })}
                            className="w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Minimum probability threshold.</p>
                    </div>

                    {/* Num Predict */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-300">Num Predict (Max Tokens)</label>
                                <HelpTooltip text="The maximum number of tokens the model can generate in a single response." />
                            </div>
                            <span className="text-sm text-blue-400">{settings.num_predict}</span>
                        </div>
                        <input
                            type="range"
                            min="100"
                            max="4096"
                            step="50"
                            value={settings.num_predict}
                            onChange={(e) => settings.updateSettings({ num_predict: parseInt(e.target.value) })}
                            className="w-full"
                        />
                    </div>

                    {/* Trim Length */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-300">Trim Length (Chars)</label>
                                <HelpTooltip text="Soft limit. Attempts to end the generation at a sentence boundary near this length to prevent cut-offs." />
                            </div>
                            <span className="text-sm text-blue-400">{settings.trimLength}</span>
                        </div>
                        <input
                            type="range"
                            min="50"
                            max="2000"
                            step="50"
                            value={settings.trimLength}
                            onChange={(e) => settings.updateSettings({ trimLength: parseInt(e.target.value) })}
                            className="w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Trims response to incomplete sentences beyond this length.</p>
                    </div>

                    <div className="pt-4 border-t border-gray-700">
                        <button
                            onClick={settings.resetSettings}
                            className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-sm"
                        >
                            Reset to Defaults
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
