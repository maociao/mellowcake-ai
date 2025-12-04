import { NextRequest, NextResponse } from 'next/server';
import { getPersonaImagePath } from '@/lib/sillytavern';
import fs from 'fs';
import path from 'path';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const filename = (await params).filename;
    const imagePath = getPersonaImagePath(filename);

    if (!imagePath || !fs.existsSync(imagePath)) {
        return new NextResponse('Image not found', { status: 404 });
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    let contentType = 'image/png'; // Default

    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.webp') contentType = 'image/webp';

    return new NextResponse(imageBuffer, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600'
        }
    });
}
