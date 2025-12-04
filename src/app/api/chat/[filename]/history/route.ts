import { NextRequest, NextResponse } from 'next/server';
import { getChatHistory, saveChatSession } from '@/lib/chat-history';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const filename = (await params).filename;
    const { searchParams } = new URL(request.url);
    const sessionFilename = searchParams.get('sessionFilename') || undefined;

    const history = await getChatHistory(filename, sessionFilename);
    return NextResponse.json(history);
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const filename = (await params).filename;
    const body = await request.json();
    const { sessionFilename, messages } = body;

    if (!sessionFilename || !messages) {
        return new NextResponse('Missing sessionFilename or messages', { status: 400 });
    }

    await saveChatSession(filename, sessionFilename, messages);
    return new NextResponse('History saved', { status: 200 });
}
