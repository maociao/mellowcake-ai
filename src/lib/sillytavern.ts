import fs from 'fs';
import path from 'path';
import { CONFIG } from '@/config';

const CHARACTERS_DIR = path.join(CONFIG.SILLYTAVERN_PATH, 'data', 'default-user', 'characters');
const WORLDS_DIR = path.join(CONFIG.SILLYTAVERN_PATH, 'data', 'default-user', 'worlds');


export interface Character {
    filename: string;
    name: string;
    avatarUrl: string;
    description?: string;
}

export interface CharacterDetails extends Character {
    first_mes?: string;
    personality?: string;
    scenario?: string;
    mes_example?: string;
}

export interface Lorebook {
    filename: string;
    name: string;
}

export async function getCharacters(): Promise<Character[]> {
    if (!fs.existsSync(CHARACTERS_DIR)) {
        console.warn(`Characters directory not found: ${CHARACTERS_DIR}`);
        return [];
    }

    const files = fs.readdirSync(CHARACTERS_DIR);
    // Filter for images or json. ST usually has .png and .json
    // We'll prefer .png and assume it's a character
    const characters = files
        .filter(file => file.endsWith('.png'))
        .map(file => ({
            filename: file,
            name: file.replace('.png', ''),
            avatarUrl: `/api/characters/${file}/image`,
        }));

    return characters;
}

export async function getLorebooks(): Promise<Lorebook[]> {
    if (!fs.existsSync(WORLDS_DIR)) {
        console.warn(`Worlds directory not found: ${WORLDS_DIR}`);
        return [];
    }

    const files = fs.readdirSync(WORLDS_DIR);
    const lorebooks = files
        .filter(file => file.endsWith('.json'))
        .map(file => ({
            filename: file,
            name: file.replace('.json', ''),
        }));

    return lorebooks;
}

export function getCharacterImagePath(filename: string): string | null {
    const filePath = path.join(CHARACTERS_DIR, filename);
    if (fs.existsSync(filePath)) {
        return filePath;
    }
    return null;
}

export function getLorebookPath(filename: string): string | null {
    const filePath = path.join(WORLDS_DIR, filename);
    if (fs.existsSync(filePath)) {
        return filePath;
    }
    return null;
}

export function getCharacterDetails(filename: string): CharacterDetails | null {
    // 1. Try to find a .json file with the same name
    const jsonPath = path.join(CHARACTERS_DIR, filename.replace('.png', '.json'));

    if (fs.existsSync(jsonPath)) {
        try {
            const data = fs.readFileSync(jsonPath, 'utf-8');
            const json = JSON.parse(data);
            return {
                filename,
                name: json.name || filename.replace('.png', ''),
                avatarUrl: `/api/characters/${filename}/image`,
                description: json.description,
                first_mes: json.first_mes,
                personality: json.personality,
                scenario: json.scenario,
                mes_example: json.mes_example,
            };
        } catch (e) {
            console.error(`Error reading character JSON for ${filename}:`, e);
            // Fallthrough to PNG reading if JSON fails? Or just return null?
            // Let's fallthrough.
        }
    }

    // 2. Try to read PNG metadata
    const pngPath = path.join(CHARACTERS_DIR, filename);
    if (fs.existsSync(pngPath)) {
        try {
            const buffer = fs.readFileSync(pngPath);
            const data = extractPngMetadata(buffer);
            if (data) {
                // SillyTavern V2/V3 data structure
                // It might be wrapped in 'data' or just flat
                const charData = data.data || data;
                return {
                    filename,
                    name: charData.name || filename.replace('.png', ''),
                    avatarUrl: `/api/characters/${filename}/image`,
                    description: charData.description,
                    first_mes: charData.first_mes,
                    personality: charData.personality,
                    scenario: charData.scenario,
                    mes_example: charData.mes_example,
                };
            }
        } catch (e) {
            console.error(`Error reading character PNG for ${filename}:`, e);
        }
    }

    return null;
}

function extractPngMetadata(buffer: Buffer): any | null {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.readUInt32BE(0) !== 0x89504E47 || buffer.readUInt32BE(4) !== 0x0D0A1A0A) {
        return null;
    }

    let offset = 8;
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);

        if (type === 'tEXt') {
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;
            const data = buffer.subarray(dataStart, dataEnd);

            // tEXt format: keyword + null + text
            const nullIndex = data.indexOf(0);
            if (nullIndex !== -1) {
                const keyword = data.toString('ascii', 0, nullIndex);
                const text = data.toString('utf8', nullIndex + 1); // Use utf8 for the content

                if (keyword === 'chara') {
                    try {
                        const decoded = Buffer.from(text, 'base64').toString('utf8');
                        return JSON.parse(decoded);
                    } catch (e) {
                        console.error('Error decoding chara chunk:', e);
                    }
                }
            }
        }

        // Move to next chunk: length + type(4) + data(length) + crc(4)
        offset += 12 + length;
    }

    return null;
}

