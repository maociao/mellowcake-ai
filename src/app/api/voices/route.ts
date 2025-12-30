import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { voices } from '@/lib/db/schema';
import path from 'path';
import fs from 'fs';
import { Logger } from '@/lib/logger';


export async function GET() {
    try {
        const allVoices = await db.select().from(voices).orderBy(voices.name);
        return NextResponse.json(allVoices);
    } catch (error) {
        Logger.error('Failed to fetch voices:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const name = formData.get('name') as string;
        const transcript = formData.get('transcript') as string | null;

        if (!file || !name) {
            return new NextResponse('Missing file or name', { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = path.extname(file.name);
        const filename = `${crypto.randomUUID()}${ext}`;

        // Ensure voices directory exists
        const voicesDir = path.join(process.cwd(), 'voices');
        if (!fs.existsSync(voicesDir)) {
            fs.mkdirSync(voicesDir, { recursive: true });
        }

        const filePath = path.join(voicesDir, filename);
        fs.writeFileSync(filePath, buffer);

        // Save to DB
        const result = await db.insert(voices).values({
            name,
            filePath: filename,
            transcript: transcript || null,
        }).returning();

        return NextResponse.json(result[0]);

    } catch (error) {
        Logger.error('Failed to upload voice:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
