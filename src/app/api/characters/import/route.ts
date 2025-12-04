import { NextRequest, NextResponse } from 'next/server';
import { characterService } from '@/services/character-service';

export async function POST(request: NextRequest) {
    try {
        const { filePath } = await request.json();

        if (!filePath) {
            return new NextResponse('Missing filePath', { status: 400 });
        }

        const character = await characterService.importFromPng(filePath);
        return NextResponse.json(character, { status: 201 });
    } catch (error) {
        console.error('Error importing character:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
