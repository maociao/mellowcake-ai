import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { characters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
    try {
        const { text, characterId } = await request.json();

        if (!text || !characterId) {
            return new NextResponse('Missing text or characterId', { status: 400 });
        }

        const character = await db.query.characters.findFirst({
            where: eq(characters.id, characterId),
        });

        if (!character || !character.voiceSample) {
            return new NextResponse('Character or voice sample not found', { status: 404 });
        }

        // Prepare FormData for Python service
        // Prepare FormData for Python service
        const formData = new FormData();
        // Strip text between asterisks (narration)
        const cleanText = text.replace(/\*[^*]*\*/g, '').trim();

        if (!cleanText) {
            // If only narration, maybe fallback to original or just silence? 
            // Let's fallback to original to avoid errors, or maybe just return empty audio?
            // For now, let's send original if clean is empty, or maybe just a space.
            // Actually, if it's all narration, we probably don't want to say anything.
            // But the user might want to hear *something*.
            // Let's assume if cleanText is empty, we skip TTS or send a silence.
            // But the Python service might error on empty text.
            // Let's send a space if empty.
        }

        formData.append('text', cleanText || '...');
        formData.append('reference_text', character.voiceSampleText || '');
        formData.append('speed', (character.voiceSpeed || 1.0).toString());

        // Read the voice sample file
        // Handle both old (/voices/...) and new (/api/voices/...) paths
        let filename = path.basename(character.voiceSample);
        let voicePath = path.join(process.cwd(), 'voices', filename);

        // Fallback for old public/voices files if not found in voices dir
        if (!fs.existsSync(voicePath)) {
            const publicVoicePath = path.join(process.cwd(), 'public', 'voices', filename);
            if (fs.existsSync(publicVoicePath)) {
                // It's an old file, use it
                // But we moved them, so this shouldn't happen unless user didn't run the move command
                voicePath = publicVoicePath; // Update voicePath to use the public path
            }
        }

        if (!fs.existsSync(voicePath)) {
            return new NextResponse('Voice sample file missing on server', { status: 500 });
        }

        const fileBuffer = fs.readFileSync(voicePath);
        const fileBlob = new Blob([fileBuffer]);
        formData.append('reference_audio', fileBlob, path.basename(voicePath));

        // Call Python service
        const ttsResponse = await fetch('http://localhost:8000/generate', {
            method: 'POST',
            body: formData,
        });

        if (!ttsResponse.ok) {
            const errorText = await ttsResponse.text();
            console.error('TTS Service Error:', errorText);
            return new NextResponse(`TTS Service Error: ${errorText}`, { status: 500 });
        }

        const audioBuffer = await ttsResponse.arrayBuffer();

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
