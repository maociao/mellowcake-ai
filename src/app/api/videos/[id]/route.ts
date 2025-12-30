
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { characterVideos } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { Logger } from '@/lib/logger';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const id = parseInt((await params).id);

    try {
        const video = await db.query.characterVideos.findFirst({
            where: eq(characterVideos.id, id),
        });

        if (!video) {
            return NextResponse.json({ error: 'Video not found' }, { status: 404 });
        }

        // Delete file
        const filePath = path.join(process.cwd(), 'public', video.filePath);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete DB entry
        await db.delete(characterVideos).where(eq(characterVideos.id, id));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        Logger.error('Delete video error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const id = parseInt((await params).id);
    const { isDefault } = await req.json();

    try {
        const video = await db.query.characterVideos.findFirst({
            where: eq(characterVideos.id, id),
        });

        if (!video) {
            return NextResponse.json({ error: 'Video not found' }, { status: 404 });
        }

        if (isDefault) {
            // Unset other defaults for this character
            await db.update(characterVideos)
                .set({ isDefault: false })
                .where(and(
                    eq(characterVideos.characterId, video.characterId),
                    // ne(characterVideos.id, id) // Optional optimization
                ));

            // Set this one as default
            await db.update(characterVideos)
                .set({ isDefault: true })
                .where(eq(characterVideos.id, id));
        } else {
            await db.update(characterVideos)
                .set({ isDefault: false })
                .where(eq(characterVideos.id, id));
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        Logger.error('Update video error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
