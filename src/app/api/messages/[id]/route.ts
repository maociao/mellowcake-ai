

import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';
import { Logger } from '@/lib/logger';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const body = await request.json();
        const { content } = body;

        if (!content) return new NextResponse('Missing content', { status: 400 });

        const updated = await chatService.updateMessageContent(id, content);

        if (!updated) return new NextResponse('Message not found', { status: 404 });

        return NextResponse.json(updated[0]);
    } catch (error) {
        Logger.error('Error updating message:', error);
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

        const success = await chatService.deleteMessageFrom(id);
        if (!success) return new NextResponse('Message not found', { status: 404 });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        Logger.error('Error deleting message:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
