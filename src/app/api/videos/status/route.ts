
import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/config';
import { db } from '@/lib/db';
import { characterVideos } from '@/lib/db/schema';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const promptId = searchParams.get('promptId');
    const characterId = searchParams.get('characterId');

    if (!promptId || !characterId) {
        return NextResponse.json({ error: 'Missing promptId or characterId' }, { status: 400 });
    }

    try {
        const res = await fetch(`${CONFIG.COMFY_URL}/history/${promptId}`);
        const history = await res.json();

        if (!history[promptId]) {
            // Check queue to see if it's still running
            const queueRes = await fetch(`${CONFIG.COMFY_URL}/queue`);
            const queueData = await queueRes.json();

            // simplistic check
            const isRunning = queueData.queue_running.some((x: any) => x[1] === promptId);
            const isPending = queueData.queue_pending.some((x: any) => x[1] === promptId);

            if (isRunning || isPending) {
                return NextResponse.json({ status: 'processing' });
            }

            // If not in history and not in queue, maybe it failed or disappeared?
            return NextResponse.json({ status: 'unknown' });
        }

        const outputs = history[promptId].outputs;
        // Node 7 is Video Combine
        const videoOutput = outputs['7'];

        if (videoOutput && videoOutput.gifs && videoOutput.gifs.length > 0) {
            // It says gifs but might be mp4 depending on format. The workflow says format: video/h264-mp4
            // Let's check the filename
            const fileInfo = videoOutput.gifs[0]; // ComfyUI often puts videos in 'gifs' key even if mp4
            const filename = fileInfo.filename;
            const subfolder = fileInfo.subfolder;
            const type = fileInfo.type;

            // Download video
            const videoUrl = `${CONFIG.COMFY_URL}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
            const response = await fetch(videoUrl);

            if (!response.ok) throw new Error('Failed to download video');

            // Save to public/videos
            const videosDir = path.join(process.cwd(), 'public', 'videos');
            if (!fs.existsSync(videosDir)) {
                fs.mkdirSync(videosDir, { recursive: true });
            }

            const savedFilename = `${characterId}_${Date.now()}_${filename}`;
            const savedPath = path.join(videosDir, savedFilename);

            // @ts-ignore
            await streamPipeline(response.body, fs.createWriteStream(savedPath));

            // Save to DB
            const dbEntry = await db.insert(characterVideos).values({
                characterId: parseInt(characterId),
                filePath: `/videos/${savedFilename}`,
                isDefault: false
            }).returning();

            return NextResponse.json({ status: 'completed', video: dbEntry[0] });
        }

        return NextResponse.json({ status: 'failed', error: 'No output found' });

    } catch (error: any) {
        console.error('Status check error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
