'use client';

import { useSettingsStore } from '@/lib/store/settings-store';
import { useState, useEffect } from 'react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const settings = useSettingsStore();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">LLM Tuning</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Global Generation Defaults */}
                    <div className="p-4 bg-gray-700/50 rounded-lg space-y-4">
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Global Defaults</h3>
                        {/* Global Short Temp */}
                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-sm font-medium text-gray-300">Global Short Temp</label>
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
                                <label className="text-sm font-medium text-gray-300">Global Long Temp</label>
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

                    <hr className="border-gray-700" />

                    {/* Temperature */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-sm font-medium text-gray-300">Temperature</label>
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
                            <label className="text-sm font-medium text-gray-300">Top P</label>
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
                            <label className="text-sm font-medium text-gray-300">Top K</label>
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
                            <label className="text-sm font-medium text-gray-300">Min P</label>
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
                            <label className="text-sm font-medium text-gray-300">Num Predict (Max Tokens)</label>
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
                            <label className="text-sm font-medium text-gray-300">Trim Length (Chars)</label>
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
