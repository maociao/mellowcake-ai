import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { characters, chatMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
    try {
        const { text, characterId, messageId, swipeIndex = 0, regenerate = false } = await request.json();

        if (!text || !characterId) {
            return new NextResponse('Missing text or characterId', { status: 400 });
        }

        // --- Caching Logic ---
        const AUDIO_CACHE_DIR = path.join(process.cwd(), 'public', 'audio-cache');
        if (!fs.existsSync(AUDIO_CACHE_DIR)) {
            fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
        }

        if (messageId && !regenerate) {
            const message = await db.query.chatMessages.findFirst({
                where: eq(chatMessages.id, messageId)
            });

            if (message && message.audioPaths) {
                try {
                    const paths = JSON.parse(message.audioPaths);
                    const cachePath = paths[swipeIndex];
                    if (cachePath) {
                        const fullPath = path.join(process.cwd(), 'public', cachePath);
                        if (fs.existsSync(fullPath)) {
                            console.log(`[TTS API] Serving from cache (index ${swipeIndex}): ${cachePath}`);
                            const fileBuffer = fs.readFileSync(fullPath);
                            return new NextResponse(fileBuffer, {
                                headers: { 'Content-Type': 'audio/wav' }
                            });
                        } else {
                            console.log(`[TTS API] Cache file missing at ${fullPath}, regenerating...`);
                        }
                    }
                } catch (e) {
                    console.error('[TTS API] Error parsing audioPaths:', e);
                }
            }
        }
        // ---------------------

        const character = await db.query.characters.findFirst({
            where: eq(characters.id, characterId),
            with: {
                voice: true
            }
        });

        if (!character) {
            return new NextResponse('Character not found', { status: 404 });
        }

        // Strip text between asterisks (narration)
        const cleanText = text.replace(/\*[^*]*\*/g, '').trim();

        if (!cleanText) {
            return new NextResponse('No speech text found', { status: 400 });
        }

        const formData = new FormData();
        formData.append('text', cleanText);

        // Determine voice path: Priority to Voice Bank, fallback to legacy
        let voicePath: string | null = null;
        let voiceReferenceText: string = character.voiceSampleText || ''; // Fallback legacy text

        // Check Voice Bank
        if ((character as any).voice) {
            const v = (character as any).voice;
            // Assuming voice files are in public/voices or strictly handled. 
            // Previous code looked in root 'voices' then 'public/voices'.
            // Let's look for the file.
            // If filePath starts with /voices/, use it relative to public?
            // Or assumes absolute?
            // Original code: path.join(process.cwd(), 'voices', v.filePath);

            // Try explicit path first (if it's a relative path stored)
            let possiblePath = path.join(process.cwd(), 'public', v.filePath);
            if (fs.existsSync(possiblePath)) {
                voicePath = possiblePath;
            } else {
                // Try voices dir
                possiblePath = path.join(process.cwd(), 'voices', v.filePath);
                if (fs.existsSync(possiblePath)) {
                    voicePath = possiblePath;
                }
            }

            if (v.transcript) {
                voiceReferenceText = v.transcript;
            }
        }
        // Fallback to legacy column
        else if (character.voiceSample) {
            let filename = path.basename(character.voiceSample);
            // Try root voices
            let possiblePath = path.join(process.cwd(), 'voices', filename);
            if (fs.existsSync(possiblePath)) {
                voicePath = possiblePath;
            } else {
                // Fallback for old public/voices files
                possiblePath = path.join(process.cwd(), 'public', 'voices', filename);
                if (fs.existsSync(possiblePath)) {
                    voicePath = possiblePath;
                }
            }
        }

        if (!voicePath || !fs.existsSync(voicePath)) {
            console.log('Voice path not found:', voicePath);
            return new NextResponse('Voice sample file missing or not assigned', { status: 404 });
        }

        // Prepare FormData for Python service

        // Determine effective reference text
        // already handled by voiceReferenceText above but let's be sure

        formData.append('text', cleanText || '...');
        formData.append('reference_text', voiceReferenceText || "The sun rises in the east."); // Default if missing
        formData.append('speed', (character.voiceSpeed || 1.0).toString());

        const fileBuffer = fs.readFileSync(voicePath);
        const fileBlob = new Blob([fileBuffer]);
        formData.append('reference_audio', fileBlob, path.basename(voicePath));

        // Call Python service
        const response = await fetch('http://localhost:8000/generate', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('TTS Service Error:', errorText);
            throw new Error(`TTS Service failed: ${response.status} ${errorText}`);
        }

        const audioBuffer = await response.arrayBuffer();

        // --- Save to Cache ---
        try {
            // Generate unique filename
            const filename = `tts-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.wav`;
            const relativePath = `/audio-cache/${filename}`;
            const diskPath = path.join(AUDIO_CACHE_DIR, filename);

            fs.writeFileSync(diskPath, Buffer.from(audioBuffer));
            console.log(`[TTS API] Cached audio to ${diskPath}`);

            if (messageId) {
                // Re-fetch message to ensure no concurrent overwrite issues (though naive JSON update is still race-prone, adequate for single user locally)
                const currentMsg = await db.query.chatMessages.findFirst({
                    where: eq(chatMessages.id, messageId)
                });

                let paths: string[] = [];
                if (currentMsg && currentMsg.audioPaths) {
                    try {
                        paths = JSON.parse(currentMsg.audioPaths);
                    } catch (e) { }
                }

                // Ensure array size
                paths[swipeIndex] = relativePath;

                await db.update(chatMessages)
                    .set({ audioPaths: JSON.stringify(paths) })
                    .where(eq(chatMessages.id, messageId));
                console.log(`[TTS API] Updated message ${messageId} index ${swipeIndex} with audio path`);
            }
        } catch (err) {
            console.error('[TTS API] Error saving to cache:', err);
            // Non-blocking, continue to return audio
        }
        // ---------------------

        return new NextResponse(audioBuffer, {
            headers: {
                'Content-Type': 'audio/wav',
            },
        });

    } catch (error) {
        console.error('Error generating TTS:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
