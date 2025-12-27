import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LLMSettings {
    temperature: number;
    top_p: number;
    top_k: number;
    min_p: number;
    num_predict: number;
    trimLength: number;
    defaultShortTemperature: number;
    defaultLongTemperature: number;
    performanceLogging: boolean;
}

interface SettingsState extends LLMSettings {
    updateSettings: (settings: Partial<LLMSettings>) => void;
    resetSettings: () => void;
}

const DEFAULT_SETTINGS: LLMSettings = {
    temperature: 1.12,
    top_p: 0.9,
    top_k: 40,
    min_p: 0.05,
    num_predict: 200,
    trimLength: 800, // Characters, roughly 200 tokens
    defaultShortTemperature: 0.7,
    defaultLongTemperature: 1.12,
    performanceLogging: false,
};

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            ...DEFAULT_SETTINGS,
            updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
            resetSettings: () => set(DEFAULT_SETTINGS),
        }),
        {
            name: 'mellowcake-settings',
        }
    )
);
