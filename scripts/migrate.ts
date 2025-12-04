import { characterService } from '../src/services/character-service';
import { personaService } from '../src/services/persona-service';
import { chatService } from '../src/services/chat-service';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../src/config';

// Mocking the alias if needed, but let's try relative imports first.
// If CONFIG import fails, we'll hardcode or read from env.

async function migrate() {
    console.log('Starting migration from SillyTavern...');
    console.log(`ST Path: ${CONFIG.SILLYTAVERN_PATH}`);

    // 1. Import Characters
    const charDir = path.join(CONFIG.SILLYTAVERN_PATH, 'data', 'default-user', 'characters');
    if (fs.existsSync(charDir)) {
        const files = fs.readdirSync(charDir).filter(f => f.endsWith('.png'));
        console.log(`Found ${files.length} characters.`);

        for (const file of files) {
            try {
                const filePath = path.join(charDir, file);
                const char = await characterService.importFromPng(filePath);
                console.log(`Imported character: ${char[0].name}`);
            } catch (e) {
                console.error(`Failed to import character ${file}:`, e);
            }
        }
    }

    // 2. Import Personas
    const personaDir = path.join(CONFIG.SILLYTAVERN_PATH, 'data', 'default-user', 'User Avatars');
    if (fs.existsSync(personaDir)) {
        const files = fs.readdirSync(personaDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg')); // Add other extensions if needed
        console.log(`Found ${files.length} personas.`);

        for (const file of files) {
            try {
                const filePath = path.join(personaDir, file);
                const persona = await personaService.importFromPath(filePath);
                console.log(`Imported persona: ${persona[0].name}`);
            } catch (e) {
                console.error(`Failed to import persona ${file}:`, e);
            }
        }
    }

    // 3. Import Chats
    // Chats are in data/default-user/chats/CharacterName/*.jsonl
    const chatsBaseDir = path.join(CONFIG.SILLYTAVERN_PATH, 'data', 'default-user', 'chats');
    if (fs.existsSync(chatsBaseDir)) {
        const charDirs = fs.readdirSync(chatsBaseDir);

        for (const charName of charDirs) {
            const charChatDir = path.join(chatsBaseDir, charName);
            if (!fs.statSync(charChatDir).isDirectory()) continue;

            // Find the character ID in our DB
            // We need a way to look up by name. characterService doesn't have it yet.
            // Let's just getAll and find.
            const allChars = await characterService.getAll();
            const character = allChars.find(c => c.name === charName || c.name === charName.replace(/_/g, ' ')); // ST might normalize names

            if (!character) {
                console.warn(`Skipping chats for unknown character: ${charName}`);
                continue;
            }

            const chatFiles = fs.readdirSync(charChatDir).filter(f => f.endsWith('.jsonl'));
            console.log(`Found ${chatFiles.length} chats for ${charName}.`);

            for (const file of chatFiles) {
                try {
                    const filePath = path.join(charChatDir, file);
                    await chatService.importFromST(filePath, character.id);
                    // console.log(`Imported chat: ${file}`);
                } catch (e) {
                    console.error(`Failed to import chat ${file}:`, e);
                }
            }
        }
    }

    console.log('Migration complete!');
}

migrate().catch(console.error);
