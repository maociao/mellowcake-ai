import { NextRequest, NextResponse } from 'next/server';
import { characterService } from '@/services/character-service';
import { lorebookService } from '@/services/lorebook-service';
import path from 'path';
import fs from 'fs';
import { Logger } from '@/lib/logger';

export async function GET() {
    try {
        const characters = await characterService.getAll();
        return NextResponse.json(characters);
    } catch (error) {
        Logger.error('Error fetching characters:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Handle Avatar Move (Temp -> Final)
        // Check if avatarPath matches our temp pattern: /api/avatars/avatar_... or /api/avatars/upload_...
        // AND verify the file is actually in the temp directory
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
                // Sanitize name for filename safety
                const safeName = (body.name || 'character').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const ext = path.extname(filename);
                const finalFilename = `${safeName}_${Date.now()}${ext}`;
                const finalPath = path.join(charDir, finalFilename);

                // Move file
                try {
                    fs.copyFileSync(tempPath, finalPath);
                    // Optional: Delete temp file?
                    // User suggested: "Save the last generation... to the public/characters folder". 
                    // Keeping temp file might be useful for history but likely clutters. Let's delete to be clean.
                    fs.unlinkSync(tempPath);

                    // Update body with new permanent path
                    // The client expects /api/avatars/[filename] format which resolves to public/characters/[filename]
                    // (Note: /api/characters/[filename] logic in api/avatars route handles serving from both temp and chars)
                    body.avatarPath = `/api/avatars/${finalFilename}`;
                    Logger.info(`[Character API] Moved avatar from ${filename} to ${finalFilename}`);
                } catch (err) {
                    Logger.error('[Character API] Failed to move avatar file:', err);
                    // Decide: Fail request or continue with temp path?
                    // Continue with temp path to avoid data loss, but log error.
                }
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
            Logger.error('Failed to create default lorebook', e);
        }

        const character = await characterService.create(body);
        return NextResponse.json(character, { status: 201 });
    } catch (error) {
        Logger.error('Error creating character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
