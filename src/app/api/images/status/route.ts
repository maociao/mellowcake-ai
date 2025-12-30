
import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/config';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);
import { Logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const promptId = searchParams.get('promptId');

    if (!promptId) {
        return NextResponse.json({ error: 'Missing promptId' }, { status: 400 });
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
        // Node 9 is Save Image
        const imageOutput = outputs['9'];

        if (imageOutput && imageOutput.images && imageOutput.images.length > 0) {
            const fileInfo = imageOutput.images[0];
            const filename = fileInfo.filename;
            const subfolder = fileInfo.subfolder;
            const type = fileInfo.type;

            // Download image
            const imageUrl = `${CONFIG.COMFY_URL}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
            const response = await fetch(imageUrl);

            if (!response.ok) throw new Error('Failed to download image');

            // Save to public/imagen-cache
            // Create directory if not exists
            const cacheDir = path.join(process.cwd(), 'public', 'imagen-cache');
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const savedFilename = `img_${Date.now()}_${filename}`;
            const savedPath = path.join(cacheDir, savedFilename);

            // @ts-ignore
            await streamPipeline(response.body, fs.createWriteStream(savedPath));

            // Return the public path (pointing to our dynamic route which we will update)
            const publicPath = `/api/avatars/${savedFilename}`;
            return NextResponse.json({ status: 'completed', imagePath: publicPath });
        }

        return NextResponse.json({ status: 'failed', error: 'No output found' });

    } catch (error: any) {
        Logger.error('Status check error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
