
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const filename = (await params).filename;

        // Security check: unexpected characters
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return new NextResponse('Invalid filename', { status: 400 });
        }

        // Path to characters folder
        const filePath = path.join(process.cwd(), 'public', 'characters', filename);

        if (!fs.existsSync(filePath)) {
            // Check temp folder
            const tempPath = path.join(process.cwd(), 'public', 'temp', filename);
            if (fs.existsSync(tempPath)) {
                return serveFile(tempPath, filename);
            }
            return new NextResponse('File not found', { status: 404 });
        }

        return serveFile(filePath, filename);
    } catch (error) {
        console.error('Error serving avatar:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

function serveFile(filePath: string, filename: string) {
    const fileBuffer = fs.readFileSync(filePath);

    // Determine content type (basic)
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    if (ext === '.gif') contentType = 'image/gif';
    if (ext === '.webp') contentType = 'image/webp';

    return new NextResponse(fileBuffer, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}
