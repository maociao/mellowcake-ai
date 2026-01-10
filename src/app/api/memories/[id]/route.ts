import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memory-service';
import { Logger } from '@/lib/logger';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params; // ID is now string (UUID)
        const searchParams = request.nextUrl.searchParams;
        const characterId = searchParams.get('characterId');

        if (!characterId) {
            return new NextResponse('Missing characterId', { status: 400 });
        }

        await memoryService.deleteMemory(parseInt(characterId), id);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        Logger.error('Error deleting memory:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { content, keywords } = body;

        const [updated] = await memoryService.updateMemory(id, content, keywords);
        return NextResponse.json(updated);
    } catch (error) {
        Logger.error('Error updating memory:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
