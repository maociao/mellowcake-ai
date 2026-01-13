
import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memory-service';
import { Logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { characterId, documents } = body;

        if (!characterId || !Array.isArray(documents)) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        Logger.info(`[API] Importing ${documents.length} documents for character ${characterId}`);
        const result = await memoryService.importDocuments(parseInt(characterId), documents);

        return NextResponse.json(result);
    } catch (error) {
        Logger.error('[API] Import failed:', error);
        return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
}
