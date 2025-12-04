import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const { content } = await request.json();
        if (!content) return new NextResponse('Missing content', { status: 400 });

        // Get original message to save it if needed (optional feature)
        // For now just update content
        const updated = await db.update(chatMessages)
            .set({ content })
            .where(eq(chatMessages.id, id))
            .returning();

        return NextResponse.json(updated[0]);
    } catch (error) {
        console.error('Error updating message:', error);
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

        await db.delete(chatMessages).where(eq(chatMessages.id, id));
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting message:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
