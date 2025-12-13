
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pump = promisify(pipeline);

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return new NextResponse('No file uploaded', { status: 400 });
        }

        // Validate type
        if (!file.type.startsWith('image/')) {
            return new NextResponse('Invalid file type', { status: 400 });
        }

        // Create temp dir
        const tempDir = path.join(process.cwd(), 'public', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const ext = path.extname(file.name) || '.png';
        const filename = `upload_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
        const filePath = path.join(tempDir, filename);

        // Save file
        // @ts-ignore
        await pump(file.stream(), fs.createWriteStream(filePath));

        // Return path compatible with our serving route
        const publicPath = `/api/avatars/${filename}`;

        return NextResponse.json({ path: publicPath });

    } catch (error) {
        console.error('Error uploading file:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
