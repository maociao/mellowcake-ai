import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { direction } = body;

        if (!id || !direction || (direction !== 'left' && direction !== 'right')) {
            return new NextResponse('Invalid parameters', { status: 400 });
        }

        const [updatedMessage] = await chatService.navigateSwipe(parseInt(id), direction);

        if (!updatedMessage) {
            return new NextResponse('Message not found', { status: 404 });
        }

        return NextResponse.json(updatedMessage);
    } catch (error) {
        console.error('[Swipe API] Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
