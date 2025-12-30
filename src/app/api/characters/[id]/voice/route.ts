import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { characters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import { writeFile } from 'fs/promises';
import { Logger } from '@/lib/logger';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = parseInt((await params).id);
        if (isNaN(id)) return new NextResponse('Invalid ID', { status: 400 });

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const transcript = formData.get('transcript') as string;

        if (!file) {
            return new NextResponse('No file uploaded', { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = `${id}_${Date.now()}_${file.name}`;
        // Save to 'voices' directory in project root
        const uploadDir = path.join(process.cwd(), 'voices');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, filename);
        await writeFile(filePath, buffer);

        // URL is now served via API
        const publicPath = `/api/voices/${filename}`;

        await db.update(characters)
            .set({
                voiceSample: publicPath,
                voiceSampleText: transcript || ''
            })
            .where(eq(characters.id, id));

        return NextResponse.json({ success: true, path: publicPath });

    } catch (error) {
        Logger.error('Error uploading voice:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
