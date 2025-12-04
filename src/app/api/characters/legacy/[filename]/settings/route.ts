import { NextRequest, NextResponse } from 'next/server';
import { saveCharacterSettings } from '@/lib/character-settings';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const filename = (await params).filename;
    const body = await request.json();
    const { selected_lorebooks } = body;

    if (!Array.isArray(selected_lorebooks)) {
        return new NextResponse('Invalid body', { status: 400 });
    }

    await saveCharacterSettings(filename, { selected_lorebooks });
    return new NextResponse('Settings saved', { status: 200 });
}
