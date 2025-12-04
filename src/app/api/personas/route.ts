import { NextRequest, NextResponse } from 'next/server';
import { personaService } from '@/services/persona-service';

export async function GET() {
    try {
        const personas = await personaService.getAll();
        return NextResponse.json(personas);
    } catch (error) {
        console.error('Error fetching personas:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const persona = await personaService.create(body);
        return NextResponse.json(persona, { status: 201 });
    } catch (error) {
        console.error('Error creating persona:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
