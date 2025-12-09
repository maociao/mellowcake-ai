import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { voices, characters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) {
            return new NextResponse('Invalid ID', { status: 400 });
        }

        const voice = await db.query.voices.findFirst({
            where: eq(voices.id, id),
        });

        if (!voice) {
            return new NextResponse('Voice not found', { status: 404 });
        }

        // Delete file
        const filePath = path.join(process.cwd(), 'voices', voice.filePath);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Set character voiceId to null for any characters using this voice
        await db.update(characters)
            .set({ voiceId: null })
            .where(eq(characters.voiceId, id));

        // Delete from DB
        await db.delete(voices).where(eq(voices.id, id));

        return new NextResponse('Voice deleted', { status: 200 });

    } catch (error) {
        console.error('Failed to delete voice:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) {
            return new NextResponse('Invalid ID', { status: 400 });
        }

        const body = await request.json();
        const { name, transcript } = body;

        await db.update(voices)
            .set({ name, transcript })
            .where(eq(voices.id, id));

        return new NextResponse('Voice updated', { status: 200 });
    } catch (error) {
        console.error('Failed to update voice:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
