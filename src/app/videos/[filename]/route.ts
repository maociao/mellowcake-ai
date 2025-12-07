
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
    const filePath = path.join(process.cwd(), 'public', 'videos', filename);

    if (!fs.existsSync(filePath)) {
        return new NextResponse('Video not found', { status: 404 });
    }

    const fileStat = fs.statSync(filePath);
    const fileSize = fileStat.size;
    const range = req.headers.get('range');

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': 'video/mp4',
        };

        // @ts-ignore
        return new NextResponse(file, { status: 206, headers: head });
    } else {
        const head = {
            'Content-Length': fileSize.toString(),
            'Content-Type': 'video/mp4',
        };
        const file = fs.createReadStream(filePath);
        // @ts-ignore
        return new NextResponse(file, { status: 200, headers: head });
    }
}
