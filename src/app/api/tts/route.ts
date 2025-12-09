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
            with: {
                // @ts-ignore - Relation is defined in schema but types might need regeneration or restart
                voice: true
            }
        });

        if (!character) {
            return new NextResponse('Character not found', { status: 404 });
        }

        // Determine voice path: Priority to Voice Bank, fallback to legacy
        let voicePath: string | null = null;
        let voiceReferenceText: string = character.voiceSampleText || ''; // Fallback legacy text

        // Check Voice Bank
        if ((character as any).voice) {
            const v = (character as any).voice;
            voicePath = path.join(process.cwd(), 'voices', v.filePath);
        }
        // Fallback to legacy column
        else if (character.voiceSample) {
            let filename = path.basename(character.voiceSample);
            voicePath = path.join(process.cwd(), 'voices', filename);

            // Fallback for old public/voices files
            if (!fs.existsSync(voicePath)) {
                const publicVoicePath = path.join(process.cwd(), 'public', 'voices', filename);
                if (fs.existsSync(publicVoicePath)) {
                    voicePath = publicVoicePath;
                }
            }
        }

        if (!voicePath || !fs.existsSync(voicePath)) {
            return new NextResponse('Voice sample file missing or not assigned', { status: 404 });
        }

        // Prepare FormData for Python service
        const formData = new FormData();
        // Strip text between asterisks (narration)
        const cleanText = text.replace(/\*[^*]*\*/g, '').trim();

        // Determine effective reference text
        let effectiveReferenceText = voiceReferenceText;
        if ((character as any).voice && (character as any).voice.transcript) {
            effectiveReferenceText = (character as any).voice.transcript;
        }

        formData.append('text', cleanText || '...');
        formData.append('reference_text', effectiveReferenceText);
        formData.append('speed', (character.voiceSpeed || 1.0).toString());

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
