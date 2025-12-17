const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Configuration
const DB_PATH = path.join(__dirname, '../mellowcake.db');
const PUBLIC_DIR = path.join(__dirname, '../public');
const AUDIO_CACHE_DIR = path.join(PUBLIC_DIR, 'audio-cache');
const IMAGEN_CACHE_DIR = path.join(PUBLIC_DIR, 'imagen-cache');
const LOG_FILE = path.join(__dirname, '../backups/cleanup.log'); // Or just stdout

// Ensure directories exist
if (!fs.existsSync(DB_PATH)) {
    console.error('Database not found:', DB_PATH);
    process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

function getAllFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(file => {
        const filePath = path.join(dir, file);
        return fs.statSync(filePath).isFile() && !file.startsWith('.');
    });
}

function cleanup() {
    log('Starting cleanup of orphaned files...');

    // 1. Collect all referenced Audio Files
    log('Collecting referenced audio files from DB...');
    const audioRows = db.prepare('SELECT audio_paths FROM chat_messages WHERE audio_paths IS NOT NULL').all();
    const referencedAudio = new Set();

    for (const row of audioRows) {
        try {
            const paths = JSON.parse(row.audio_paths);
            if (Array.isArray(paths)) {
                paths.forEach(p => {
                    if (p) referencedAudio.add(path.basename(p));
                });
            }
        } catch (e) {
            // Ignore parsing errors, or handle 
        }
    }

    // 2. Collect all referenced Image Files
    log('Collecting referenced image files from DB...');
    const contentRows = db.prepare('SELECT content, swipes FROM chat_messages').all();
    const referencedImages = new Set();

    // Regex to capture filenames in markdown links or paths
    // Look for img_... referenced in /api/avatars/ or /imagen-cache/
    // We strictly look for filenames present in the cache, which follow a pattern.
    // However, safest is to just extract any string that looks like a filename we track.
    // The files in imagen-cache seem to start with 'img_' and end with '.png'.
    // Let's be broader: look for the exact filename if it appears in the text.

    // Optimization: Construct a giant text blob? No, better to regex each row.
    const imageLinkRegex = /([a-zA-Z0-9._-]+\.(?:png|jpg|jpeg|webp|gif))/g;

    for (const row of contentRows) {
        const textToSearch = (row.content || '') + (row.swipes || '');
        const matches = textToSearch.match(imageLinkRegex);
        if (matches) {
            matches.forEach(m => referencedImages.add(m));
        }
    }

    // Also check Characters and Personas for avatar usage (just in case)
    const charRows = db.prepare('SELECT avatar_path FROM characters').all();
    const personaRows = db.prepare('SELECT avatar_path FROM personas').all();

    [...charRows, ...personaRows].forEach(row => {
        if (row.avatar_path) referencedImages.add(path.basename(row.avatar_path));
    });

    // 3. Cleanup Audio Cache
    const audioFiles = getAllFiles(AUDIO_CACHE_DIR);
    let audioDeleted = 0;

    log(`Found ${audioFiles.length} files in audio-cache.`);

    for (const file of audioFiles) {
        if (!referencedAudio.has(file)) {
            // Check if it's very recent (grace period) - e.g. 1 hour
            // This prevents deleting files that are currently being generated/uploaded but not yet saved to DB
            const filePath = path.join(AUDIO_CACHE_DIR, file);
            const stats = fs.statSync(filePath);
            const ageMs = Date.now() - stats.mtimeMs;

            if (ageMs > 3600000) { // 1 hour
                fs.unlinkSync(filePath);
                audioDeleted++;
                // log(`Deleted orphaned audio: ${file}`);
            }
        }
    }
    log(`Deleted ${audioDeleted} orphaned audio files.`);

    // 4. Cleanup Imagen Cache
    const imageFiles = getAllFiles(IMAGEN_CACHE_DIR);
    let imagesDeleted = 0;

    log(`Found ${imageFiles.length} files in imagen-cache.`);

    for (const file of imageFiles) {
        if (!referencedImages.has(file)) {
            // Grace period
            const filePath = path.join(IMAGEN_CACHE_DIR, file);
            const stats = fs.statSync(filePath);
            const ageMs = Date.now() - stats.mtimeMs;

            if (ageMs > 3600000) { // 1 hour
                fs.unlinkSync(filePath);
                imagesDeleted++;
                // log(`Deleted orphaned image: ${file}`);
            }
        }
    }
    log(`Deleted ${imagesDeleted} orphaned image files.`);
    log('Cleanup completed.');
}

cleanup();
