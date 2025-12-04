import fs from 'fs';
import path from 'path';
import { CONFIG } from '@/config';
import { getCharacterDetails } from './sillytavern';

const CHATS_DIR = path.join(CONFIG.SILLYTAVERN_PATH, 'data', 'default-user', 'chats');

export interface ChatMessage {
    name: string; // 'User' or Character Name
    is_user: boolean;
    is_name: boolean;
    send_date: string;
    mes: string;
    swipes?: string[]; // Array of message content candidates
    swipe_id?: number; // Index of the currently selected swipe
    prompt?: string; // Prompt used for this message (optional)
    // ... other ST fields
}

// ... (existing code)

export async function saveChatSession(characterFilename: string, sessionFilename: string, messages: any[]) {
    const charChatDir = getChatDir(characterFilename);
    if (!charChatDir) return;

    const filePath = path.join(charChatDir, sessionFilename);

    // We need to preserve metadata from the first line if it exists
    let metadataLine = '';
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        if (lines.length > 0) {
            metadataLine = lines[0];
        }
    }

    // If no metadata, create default (shouldn't happen usually if we read first)
    if (!metadataLine) {
        const charDetails = getCharacterDetails(characterFilename);
        const charName = charDetails?.name || 'Character';
        const metadata = {
            user_name: 'User',
            character_name: charName,
            create_date: new Date().toLocaleString(),
            chat_metadata: {}
        };
        metadataLine = JSON.stringify(metadata);
    }

    // Convert internal messages back to ST format
    const stMessages = messages.map(msg => {
        const isUser = msg.role === 'user';
        return {
            name: isUser ? 'User' : 'Char', // Ideally we get real name
            is_user: isUser,
            is_name: true,
            send_date: new Date().toLocaleString(), // We lose original date if we don't store it. 
            // Ideally we should store the full ST object in memory and just update 'mes' and 'swipes'.
            // But our frontend uses a simplified Message interface.
            // For now, let's just write what we have.
            mes: msg.content,
            swipes: msg.swipes,
            swipe_id: msg.swipe_id,
            prompt: msg.prompt
        };
    });

    // Write file
    const fileContent = [metadataLine, ...stMessages.map(m => JSON.stringify(m))].join('\n') + '\n';
    fs.writeFileSync(filePath, fileContent);
}

export interface ChatSession {
    filename: string;
    created: string;
    last_message: string;
    message_count: number;
}

export function getChatDir(characterFilename: string): string | null {
    const charDetails = getCharacterDetails(characterFilename);
    if (!charDetails) return null;
    return path.join(CHATS_DIR, charDetails.name);
}

export async function listChatSessions(characterFilename: string): Promise<ChatSession[]> {
    const charChatDir = getChatDir(characterFilename);
    if (!charChatDir || !fs.existsSync(charChatDir)) return [];

    const files = fs.readdirSync(charChatDir).filter(f => f.endsWith('.jsonl'));

    return files.map(file => {
        const filePath = path.join(charChatDir, file);
        const stat = fs.statSync(filePath);
        // We could read the file to get message count, but that might be slow for many files.
        // For now just return basic info.
        return {
            filename: file,
            created: stat.birthtime.toLocaleString(),
            last_message: stat.mtime.toLocaleString(),
            message_count: 0 // Placeholder
        };
    }).sort((a, b) => new Date(b.last_message).getTime() - new Date(a.last_message).getTime());
}

export async function getChatHistory(characterFilename: string, sessionFilename?: string): Promise<any[]> {
    const charChatDir = getChatDir(characterFilename);
    if (!charChatDir || !fs.existsSync(charChatDir)) return [];

    let filePath: string;

    if (sessionFilename) {
        filePath = path.join(charChatDir, sessionFilename);
        if (!fs.existsSync(filePath)) return [];
    } else {
        // Default to most recent
        const sessions = await listChatSessions(characterFilename);
        if (sessions.length === 0) return [];
        filePath = path.join(charChatDir, sessions[0].filename);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    // Skip first line (metadata)
    const messages = lines.slice(1).map(line => {
        try {
            const json = JSON.parse(line);
            return {
                role: json.is_user ? 'user' : 'assistant',
                content: json.mes,
                prompt: json.prompt, // Read prompt if available (custom field we might add)
                swipes: json.swipes || [],
                swipe_id: json.swipe_id || 0,
            };
        } catch (e) {
            return null;
        }
    }).filter(m => m !== null);

    return messages;
}

export async function createChatSession(characterFilename: string): Promise<string | null> {
    const charDetails = getCharacterDetails(characterFilename);
    if (!charDetails) return null;
    const charName = charDetails.name;
    const charChatDir = path.join(CHATS_DIR, charName);

    if (!fs.existsSync(charChatDir)) {
        fs.mkdirSync(charChatDir, { recursive: true });
    }

    const dateStr = new Date().toISOString().replace(/:/g, '-');
    const filename = `${charName} - ${dateStr}.jsonl`;
    const filePath = path.join(charChatDir, filename);

    const metadata = {
        user_name: 'User',
        character_name: charName,
        create_date: new Date().toLocaleString(),
        chat_metadata: {}
    };
    fs.writeFileSync(filePath, JSON.stringify(metadata) + '\n');

    return filename;
}

export async function appendChatMessage(characterFilename: string, sessionFilename: string, message: any, prompt?: string) {
    const charChatDir = getChatDir(characterFilename);
    if (!charChatDir) return;

    const filePath = path.join(charChatDir, sessionFilename);
    if (!fs.existsSync(filePath)) return; // Should exist

    // ST Message Format
    const stMessage = {
        name: message.role === 'user' ? 'User' : 'Char', // We need char name but it's not passed here easily without fetch. 
        // Actually we can just use 'Char' or get it from dir name? 
        // Let's re-fetch details or assume caller passes valid session.
        // For simplicity, let's just use what we have.
        is_user: message.role === 'user',
        is_name: true,
        send_date: new Date().toLocaleString(),
        mes: message.content,
        prompt: prompt, // Save prompt for debugging/logging
    };

    // Fix name field
    if (!stMessage.is_user) {
        const charDetails = getCharacterDetails(characterFilename);
        if (charDetails) stMessage.name = charDetails.name;
    }

    fs.appendFileSync(filePath, JSON.stringify(stMessage) + '\n');
}
