import fs from 'fs';
import { getLorebookPath } from './sillytavern';

export interface LorebookEntry {
    keys: string[];
    content: string;
    enabled: boolean;
}

export interface LorebookData {
    entries: Record<string, LorebookEntry>; // ST uses a map or array? Usually a map with IDs, or an array.
    // Actually ST V3 uses 'entries' as a map where keys are IDs.
}

export function getLorebookEntries(filename: string): LorebookEntry[] {
    const filePath = getLorebookPath(filename);
    if (!filePath) return [];

    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const json = JSON.parse(data);

        // Handle different versions if necessary, but assuming V3 standard
        if (json.entries) {
            return Object.values(json.entries).map((entry: any) => ({
                keys: entry.key || [], // 'key' is usually the field for keywords
                content: entry.content || '',
                enabled: entry.enabled !== false,
            }));
        }
        return [];
    } catch (e) {
        console.error(`Error reading lorebook ${filename}:`, e);
        return [];
    }
}

export function scanLorebooks(text: string, lorebookFilenames: string[]): string[] {
    const injectedContent: string[] = [];
    const lowerText = text.toLowerCase();

    for (const filename of lorebookFilenames) {
        const entries = getLorebookEntries(filename);
        for (const entry of entries) {
            if (!entry.enabled) continue;

            // Check if any key is present in the text
            const isMatch = entry.keys.some(key => lowerText.includes(key.toLowerCase()));
            if (isMatch) {
                injectedContent.push(entry.content);
            }
        }
    }

    return injectedContent;
}
