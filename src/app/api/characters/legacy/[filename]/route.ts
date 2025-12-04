import { NextRequest, NextResponse } from 'next/server';
import { getCharacterDetails } from '@/lib/sillytavern';
import { getCharacterSettings } from '@/lib/character-settings';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const filename = (await params).filename;
    const character = getCharacterDetails(filename);

    if (!character) {
        return new NextResponse('Character not found', { status: 404 });
    }

    const settings = await getCharacterSettings(filename);

    return NextResponse.json({
        ...character,
        ...settings
    });
}
