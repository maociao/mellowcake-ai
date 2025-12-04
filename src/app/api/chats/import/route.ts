import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/services/chat-service';

export async function POST(request: NextRequest) {
    try {
        const { filePath, characterId, personaId } = await request.json();

        if (!filePath || !characterId) {
            return new NextResponse('Missing filePath or characterId', { status: 400 });
        }

        const session = await chatService.importFromST(filePath, characterId, personaId);
        return NextResponse.json(session, { status: 201 });
    } catch (error) {
        console.error('Error importing chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
