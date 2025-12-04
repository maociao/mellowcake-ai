import { NextRequest, NextResponse } from 'next/server';
import { personaService } from '@/services/persona-service';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const persona = await personaService.getById(id);
        if (!persona) return new NextResponse('Persona not found', { status: 404 });

        return NextResponse.json(persona);
    } catch (error) {
        console.error('Error fetching persona:', error);
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
        const updated = await personaService.update(id, body);
        return NextResponse.json(updated);
    } catch (error) {
        console.error('Error updating persona:', error);
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

        await personaService.delete(id);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting persona:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
