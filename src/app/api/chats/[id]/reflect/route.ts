import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';
import { Logger } from '@/lib/logger';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const sessionId = parseInt(id);

        if (isNaN(sessionId)) {
            return new NextResponse('Invalid session ID', { status: 400 });
        }

        const result = await chatService.generateSessionReflection(sessionId);

        if (result && result.success) {
            return NextResponse.json(result);
        } else {
            return NextResponse.json(result || { success: false, error: 'Unknown error' }, { status: 400 });
        }
    } catch (error) {
        Logger.error('[Reflect API] Error triggering reflection:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
