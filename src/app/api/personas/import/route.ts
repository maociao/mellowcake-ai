import { NextRequest, NextResponse } from 'next/server';
import { personaService } from '@/services/persona-service';
import { Logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
    try {
        const { filePath, name, description } = await request.json();

        if (!filePath) {
            return new NextResponse('Missing filePath', { status: 400 });
        }

        const persona = await personaService.importFromPath(filePath, name, description);
        return NextResponse.json(persona, { status: 201 });
    } catch (error) {
        Logger.error('Error importing persona:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
