import { NextRequest, NextResponse } from 'next/server';
import { lorebookService } from '@/services/lorebook-service';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const body = await request.json();
        const updatedEntry = await lorebookService.updateEntry(id, body);
        return NextResponse.json(updatedEntry);
    } catch (error) {
        console.error('Error updating entry:', error);
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

        await lorebookService.deleteEntry(id);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting entry:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
