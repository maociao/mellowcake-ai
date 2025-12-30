import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';
import { characterService } from '@/services/character-service';
import { Logger } from '@/lib/logger';

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
        Logger.error('Error fetching sessions:', error);
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

        // Get character to check for default lorebooks
        const character = await characterService.getById(characterId);
        let defaultLorebooks: string[] | undefined;

        if (character && character.lorebooks) {
            try {
                defaultLorebooks = JSON.parse(character.lorebooks);
            } catch (e) {
                Logger.error('Error parsing character default lorebooks:', e);
            }
        }

        const session = await chatService.createSession(characterId, personaId, name, defaultLorebooks);
        return NextResponse.json(session[0], { status: 201 });
    } catch (error) {
        Logger.error('Error creating session:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
