import { NextRequest, NextResponse } from 'next/server';
import { characterService } from '@/services/character-service';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const character = await characterService.getById(id);
        if (!character) return new NextResponse('Character not found', { status: 404 });

        return NextResponse.json(character);
    } catch (error) {
        console.error('Error fetching character:', error);
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
        const updated = await characterService.update(id, body);
        return NextResponse.json(updated);
    } catch (error) {
        console.error('Error updating character:', error);
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

        await characterService.delete(id);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
