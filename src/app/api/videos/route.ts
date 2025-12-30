
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { characterVideos } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');

    if (!characterId) {
        return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });
    }

    try {
        const videos = await db.query.characterVideos.findMany({
            where: eq(characterVideos.characterId, parseInt(characterId)),
            orderBy: [desc(characterVideos.createdAt)],
        });

        return NextResponse.json(videos);
    } catch (error: any) {
        Logger.error('Fetch videos error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
