import { NextRequest, NextResponse } from 'next/server';
import { listChatSessions, createChatSession } from '@/lib/chat-history';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    console.log('GET /sessions hit');
    const filename = (await params).filename;
    console.log('Filename:', filename);
    const sessions = await listChatSessions(filename);
    console.log('Sessions:', sessions);
    return NextResponse.json(sessions);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    console.log('POST /sessions hit');
    const filename = (await params).filename;
    console.log('Filename:', filename);
    const sessionFilename = await createChatSession(filename);
    console.log('Created Session:', sessionFilename);

    if (!sessionFilename) {
        return new NextResponse('Failed to create session', { status: 500 });
    }

    return NextResponse.json({ filename: sessionFilename });
}
