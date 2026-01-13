
import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memory-service';
import { Logger } from '@/lib/logger';

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');

    if (!characterId) {
        return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });
    }

    try {
        Logger.info(`[API] Clearing memory bank for character ${characterId}`);
        const success = await memoryService.deleteMemoryBank(parseInt(characterId));

        if (success) {
            // Re-ensure bank exists (empty) so future interactions don't fail 404
            // We need basic char info, but we don't have it here easily.
            // Hindsight delete usually deletes the bank config too.
            // But next interaction will re-create it locally if we call ensureMemoryBank.
            // For now, just return success.
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Failed to delete bank' }, { status: 500 });
        }
    } catch (error) {
        Logger.error('[API] Bank clear failed:', error);
        return NextResponse.json({ error: 'Bank clear failed' }, { status: 500 });
    }
}
