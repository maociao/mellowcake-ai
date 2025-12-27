import { NextRequest, NextResponse } from 'next/server';
import { characterService } from '@/services/character-service';
import path from 'path';
import fs from 'fs';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const character = await characterService.getById(id);
        if (!character) return new NextResponse('Character not found', { status: 404 });

        return NextResponse.json(character);
    } catch (error) {
        console.error('Error fetching character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const body = await request.json();

        // Handle Avatar Move (Temp -> Final)
        if (body.avatarPath && (body.avatarPath.startsWith('/api/avatars/avatar_') || body.avatarPath.startsWith('/api/avatars/upload_'))) {
            const filename = body.avatarPath.replace('/api/avatars/', '');
            const tempPath = path.join(process.cwd(), 'public', 'temp', filename);

            if (fs.existsSync(tempPath)) {
                const charDir = path.join(process.cwd(), 'public', 'characters');
                if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

                const safeName = (body.name || 'character').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const ext = path.extname(filename);
                const finalFilename = `${safeName}_${Date.now()}${ext}`;
                const finalPath = path.join(charDir, finalFilename);

                try {
                    fs.copyFileSync(tempPath, finalPath);
                    fs.unlinkSync(tempPath);
                    body.avatarPath = `/api/avatars/${finalFilename}`;
                } catch (err) {
                    console.error('[Character API] Failed to move avatar file:', err);
                }
            }
        }

        const updated = await characterService.update(id, body);
        return NextResponse.json(updated);
    } catch (error) {
        console.error('Error updating character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const { searchParams } = new URL(request.url);
        const deleteLorebook = searchParams.get('deleteLorebook') === 'true';

        await characterService.delete(id, deleteLorebook);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const body = await request.json();

        // Handle Avatar Move (Temp -> Final)
        if (body.avatarPath && (body.avatarPath.startsWith('/api/avatars/avatar_') || body.avatarPath.startsWith('/api/avatars/upload_'))) {
            const filename = body.avatarPath.replace('/api/avatars/', '');
            const tempPath = path.join(process.cwd(), 'public', 'temp', filename);

            if (fs.existsSync(tempPath)) {
                const charDir = path.join(process.cwd(), 'public', 'characters');
                if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

                const safeName = (body.name || 'character').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const ext = path.extname(filename);
                const finalFilename = `${safeName}_${Date.now()}${ext}`;
                const finalPath = path.join(charDir, finalFilename);

                try {
                    fs.copyFileSync(tempPath, finalPath);
                    fs.unlinkSync(tempPath);
                    body.avatarPath = `/api/avatars/${finalFilename}`;
                } catch (err) {
                    console.error('[Character API] Failed to move avatar file:', err);
                }
            }
        }

        const updatedCharacter = await characterService.update(id, body);
        return NextResponse.json(updatedCharacter);
    } catch (error) {
        console.error('Error updating character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
