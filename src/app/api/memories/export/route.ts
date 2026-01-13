
import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memory-service';
import { Logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');

    if (!characterId) {
        return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });
    }

    try {
        Logger.info(`[API] Exporting memories for character ${characterId}`);
        const documents = await memoryService.getAllDocuments(parseInt(characterId));

        const json = JSON.stringify(documents, null, 2);

        return new NextResponse(json, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="memories_character_${characterId}.json"`
            }
        });
    } catch (error) {
        Logger.error('[API] Export failed:', error);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}
