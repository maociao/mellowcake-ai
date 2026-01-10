import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memory-service';
import { Logger } from '@/lib/logger';


export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const characterId = parseInt(searchParams.get('characterId') || '');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';

    if (!characterId) {
        return new NextResponse('Missing characterId', { status: 400 });
    }

    try {
        let result;
        if (search) {
            // If searching, use the search endpoint (Hindsight recall)
            // Note: Hindsight recall doesn't support offset pagination in the same way,
            // but we pass limit. We might need to handle pagination differently later.
            result = await memoryService.searchMemories(characterId, search, limit);
        } else {
            // Standard list with paging
            result = await memoryService.listMemories(characterId, limit, offset);
        }

        return NextResponse.json(result);
    } catch (error) {
        Logger.error('Error fetching memories:', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { characterId, content } = body;

        if (!characterId || !content) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        const [memory] = await memoryService.createMemory(characterId, content);
        return NextResponse.json(memory);
    } catch (error) {
        Logger.error('Error creating memory:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
