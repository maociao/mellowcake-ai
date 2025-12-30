import { NextRequest, NextResponse } from 'next/server';
import { lorebookService } from '@/services/lorebook-service';
import { Logger } from '@/lib/logger';

export async function GET() {
    const lorebooks = await lorebookService.getAll();
    return NextResponse.json(lorebooks);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const newLorebook = await lorebookService.create(body);
        return NextResponse.json(newLorebook, { status: 201 });
    } catch (error) {
        Logger.error('Error creating lorebook:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
