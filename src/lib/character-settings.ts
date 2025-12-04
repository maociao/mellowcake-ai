import fs from 'fs';
import path from 'path';
import { getChatDir } from './chat-history';

export interface CharacterSettings {
    selected_lorebooks: string[];
}

export async function getCharacterSettings(characterFilename: string): Promise<CharacterSettings> {
    const chatDir = getChatDir(characterFilename);
    if (!chatDir) return { selected_lorebooks: [] };

    const settingsPath = path.join(chatDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
        try {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            return JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse character settings', e);
        }
    }
    return { selected_lorebooks: [] };
}

export async function saveCharacterSettings(characterFilename: string, settings: CharacterSettings): Promise<void> {
    const chatDir = getChatDir(characterFilename);
    if (!chatDir) return;

    // Ensure directory exists (getChatDir usually ensures it, but safe to check)
    if (!fs.existsSync(chatDir)) {
        fs.mkdirSync(chatDir, { recursive: true });
    }

    const settingsPath = path.join(chatDir, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
