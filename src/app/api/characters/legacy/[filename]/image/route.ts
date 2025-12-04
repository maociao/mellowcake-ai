import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getCharacterImagePath } from '@/lib/sillytavern';
import path from 'path';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const filename = (await params).filename;
    const filePath = getCharacterImagePath(filename);

    if (!filePath) {
        return new NextResponse('Not found', { status: 404 });
    }

    const imageBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const contentType = `image/${ext === 'svg' ? 'svg+xml' : ext}`;

    return new NextResponse(imageBuffer, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
