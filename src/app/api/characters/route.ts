import { NextRequest, NextResponse } from 'next/server';
import { characterService } from '@/services/character-service';
import { lorebookService } from '@/services/lorebook-service';
import path from 'path';
import fs from 'fs';

export async function GET() {
    try {
        const characters = await characterService.getAll();
        return NextResponse.json(characters);
    } catch (error) {
        console.error('Error fetching characters:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Handle Avatar Move (Temp -> Final)
        // Check if avatarPath matches our temp pattern: /api/avatars/avatar_... or /api/avatars/upload_...
        if (body.avatarPath && (body.avatarPath.startsWith('/api/avatars/avatar_') || body.avatarPath.startsWith('/api/avatars/upload_'))) {
            const filename = body.avatarPath.replace('/api/avatars/', '');
            const tempPath = path.join(process.cwd(), 'public', 'temp', filename);

            if (fs.existsSync(tempPath)) {
                // Ensure characters dir exists
                const charDir = path.join(process.cwd(), 'public', 'characters');
                if (!fs.existsSync(charDir)) {
                    fs.mkdirSync(charDir, { recursive: true });
                }

                // Create new filename based on character name
                const sanitized = (body.name || 'character').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const newFilename = `${sanitized}_${Date.now()}.png`; // Assuming png, though temp file has ext
                // Better: keep original extension
                const ext = path.extname(filename);
                const finalFilename = `${sanitized}_${Date.now()}${ext}`;
                const finalPath = path.join(charDir, finalFilename);

                // Move file
                fs.copyFileSync(tempPath, finalPath);
                fs.unlinkSync(tempPath);

                // Update body
                body.avatarPath = `/api/avatars/${finalFilename}`;
            }
        }

        // Create Default Lorebook
        try {
            const lorebook = await lorebookService.create({
                name: body.name,
                description: `Default lorebook for ${body.name}`
            });

            // Initialize lorebooks array if empty
            if (!body.lorebooks) {
                body.lorebooks = [];
            } else if (typeof body.lorebooks === 'string') {
                // Should potentially parse if it's coming as string, but usually create body is JSON
                // If it's array coming in, fine.
            }

            // Assign Lorebook (by name)
            // The schema stores JSON string array of NAMES.
            // body.lorebooks might be array if coming from JSON request.
            if (Array.isArray(body.lorebooks)) {
                body.lorebooks.push(lorebook.name);
            } else {
                body.lorebooks = [lorebook.name];
            }

        } catch (e) {
            console.error('Failed to create default lorebook', e);
        }

        const character = await characterService.create(body);
        return NextResponse.json(character, { status: 201 });
    } catch (error) {
        console.error('Error creating character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
