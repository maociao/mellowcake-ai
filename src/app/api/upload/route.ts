
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { Logger } from '@/lib/logger';

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

        const folder = formData.get('folder') as string;

        let saveDir = path.join(process.cwd(), 'public', 'temp');
        if (folder === 'personas') {
            saveDir = path.join(process.cwd(), 'public', 'personas');
        }

        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        const ext = path.extname(file.name) || '.png';
        const prefix = folder === 'personas' ? 'persona_' : 'upload_';
        const filename = `${prefix}${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
        const filePath = path.join(saveDir, filename);

        // Save file
        // @ts-ignore
        await pump(file.stream(), fs.createWriteStream(filePath));

        // Return path compatible with our serving route
        const publicPath = `/api/avatars/${filename}`;

        return NextResponse.json({ path: publicPath });

    } catch (error) {
        Logger.error('Error uploading file:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
