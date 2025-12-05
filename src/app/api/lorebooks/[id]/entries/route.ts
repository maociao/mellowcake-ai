import { NextRequest, NextResponse } from 'next/server';
import { lorebookService } from '@/services/lorebook-service';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const lorebookId = parseInt((await params).id);
        if (isNaN(lorebookId)) return new NextResponse('Invalid ID', { status: 400 });

        const body = await request.json();
        const newEntry = await lorebookService.addEntry(lorebookId, body);
        return NextResponse.json(newEntry, { status: 201 });
    } catch (error) {
        console.error('Error creating entry:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
