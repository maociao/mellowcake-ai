import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memory-service';
import { Logger } from '@/lib/logger';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: idStr } = await params;
        const id = parseInt(idStr);
        await memoryService.deleteMemory(id);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        Logger.error('Error deleting memory:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: idStr } = await params;
        const id = parseInt(idStr);
        const body = await request.json();
        const { content, keywords } = body;

        const [updated] = await memoryService.updateMemory(id, content, keywords);
        return NextResponse.json(updated);
    } catch (error) {
        Logger.error('Error updating memory:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
