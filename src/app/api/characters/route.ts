import { NextRequest, NextResponse } from 'next/server';
import { characterService } from '@/services/character-service';

export async function GET() {
    try {
        const characters = await characterService.getAll();
        return NextResponse.json(characters);
    } catch (error) {
        console.error('Error fetching characters:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const character = await characterService.create(body);
        return NextResponse.json(character, { status: 201 });
    } catch (error) {
        console.error('Error creating character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
