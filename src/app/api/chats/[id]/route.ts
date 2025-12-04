import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const session = await chatService.getSessionById(id);
        if (!session) return new NextResponse('Session not found', { status: 404 });

        const messages = await chatService.getMessages(id);

        return NextResponse.json({ session, messages });
    } catch (error) {
        console.error('Error fetching chat:', error);
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

        await chatService.deleteSession(id);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting session:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
