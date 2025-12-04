import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const characterId = searchParams.get('characterId');

        if (!characterId) {
            return new NextResponse('Missing characterId', { status: 400 });
        }

        const sessions = await chatService.getSessionsByCharacterId(parseInt(characterId));
        return NextResponse.json(sessions);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { characterId, personaId, name } = body;

        if (!characterId) {
            return new NextResponse('Missing characterId', { status: 400 });
        }

        const session = await chatService.createSession(characterId, personaId, name);
        return NextResponse.json(session[0], { status: 201 });
    } catch (error) {
        console.error('Error creating session:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
