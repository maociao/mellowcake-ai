import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';

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
        console.error('Error deleting message:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
