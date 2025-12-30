import { NextRequest, NextResponse } from 'next/server';
import { lorebookService } from '@/services/lorebook-service';
import { Logger } from '@/lib/logger';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const lorebook = await lorebookService.getById(id);
        if (!lorebook) return new NextResponse('Lorebook not found', { status: 404 });

        return NextResponse.json(lorebook);
    } catch (error) {
        Logger.error('Error fetching lorebook:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const body = await request.json();
        const updatedLorebook = await lorebookService.update(id, body);
        return NextResponse.json(updatedLorebook);
    } catch (error) {
        Logger.error('Error updating lorebook:', error);
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

        await lorebookService.delete(id);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        Logger.error('Error deleting lorebook:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
