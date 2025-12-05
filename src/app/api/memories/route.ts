import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memory-service';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const characterId = searchParams.get('characterId');

    if (!characterId) {
        return new NextResponse('Missing characterId', { status: 400 });
    }

    try {
        const memories = await memoryService.getMemories(parseInt(characterId));
        return NextResponse.json(memories);
    } catch (error) {
        console.error('Error fetching memories:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { characterId, content, keywords } = body;

        if (!characterId || !content) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        const [memory] = await memoryService.createMemory(characterId, content, keywords || []);
        return NextResponse.json(memory);
    } catch (error) {
        console.error('Error creating memory:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
