const fs = require('fs');
const path = require('path');
const http = require('http');

const CHARACTERS_DIR = '/home/mellowcake/Code/SillyTavern/data/default-user/characters';

async function testCharacter(filename) {
    if (!filename.endsWith('.png')) return;

    console.log(`Testing ${filename}...`);

    // 1. Test GET /api/characters/[filename]
    const getRes = await fetch(`http://localhost:3000/api/characters/${encodeURIComponent(filename)}`);
    if (!getRes.ok) {
        console.error(`  GET FAILED: ${getRes.status}`);
        return;
    }
    const charData = await getRes.json();
    console.log(`  GET OK: ${charData.name}`);

    // 2. Test POST /api/chat
    const postRes = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [{ role: 'user', content: 'Hello' }],
            characterFilename: filename,
            lorebookFilenames: []
        })
    });

    if (!postRes.ok) {
        console.error(`  POST FAILED: ${postRes.status}`);
        const text = await postRes.text();
        console.error(`  Error: ${text}`);
    } else {
        console.log(`  POST OK`);
        // Cancel stream to save time
        if (postRes.body) {
            const reader = postRes.body.getReader();
            await reader.cancel();
        }
    }
}

async function run() {
    const files = fs.readdirSync(CHARACTERS_DIR);
    for (const file of files) {
        await testCharacter(file);
    }
}

run();
