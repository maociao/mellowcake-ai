
import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/config';
import { db } from '@/lib/db'; // Assuming this exists, I need to verify
import { characterVideos, characters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

// Helper to upload image to ComfyUI
async function uploadImageToComfy(imagePath: string, filename: string) {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(imagePath);
    const blob = new Blob([fileBuffer], { type: 'image/png' }); // Assuming PNG for now
    formData.append('image', blob, filename);
    formData.append('overwrite', 'true');

    const res = await fetch(`${CONFIG.COMFY_URL}/upload/image`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        throw new Error(`Failed to upload image: ${res.statusText}`);
    }
    return await res.json();
}

// Helper to queue prompt
async function queuePrompt(workflow: any) {
    const res = await fetch(`${CONFIG.COMFY_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
    });

    if (!res.ok) {
        throw new Error(`Failed to queue prompt: ${res.statusText}`);
    }
    return await res.json();
}

// Helper to get history
async function getHistory(promptId: string) {
    const res = await fetch(`${CONFIG.COMFY_URL}/history/${promptId}`);
    if (!res.ok) {
        throw new Error(`Failed to get history: ${res.statusText}`);
    }
    return await res.json();
}

export async function POST(req: NextRequest) {
    try {
        const { characterId } = await req.json();
        if (!characterId) {
            return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });
        }

        // 1. Get Character
        const character = await db.query.characters.findFirst({
            where: eq(characters.id, characterId),
        });

        if (!character || !character.avatarPath) {
            return NextResponse.json({ error: 'Character or avatar not found' }, { status: 404 });
        }

        // 2. Prepare Workflow
        const workflowPath = path.join(process.cwd(), 'mellowcake-ai-wan-image-2-video.json');
        const workflowStr = fs.readFileSync(workflowPath, 'utf-8');
        const workflow = JSON.parse(workflowStr);

        // 3. Upload Avatar
        // Avatar path is likely relative to public or absolute. 
        // If it starts with /, it might be in public.
        let localAvatarPath = character.avatarPath;
        if (localAvatarPath.startsWith('/')) {
            localAvatarPath = path.join(process.cwd(), 'public', localAvatarPath);
        }

        // Check if file exists
        if (!fs.existsSync(localAvatarPath)) {
            return NextResponse.json({ error: `Avatar file not found at ${localAvatarPath}` }, { status: 404 });
        }

        const filename = `char_${characterId}_${Date.now()}.png`;
        await uploadImageToComfy(localAvatarPath, filename);

        // 4. Update Workflow with new image
        // Node 18 is Load Image
        if (workflow['18']) {
            workflow['18'].inputs.image = filename;
        }
        // Update output filename prefix
        // Node 7 is Video Combine
        if (workflow['7']) {
            workflow['7'].inputs.filename_prefix = `mellowcake-ai/char_${characterId}`;
        }

        // 4b. Randomize Seeds
        // Node 15 is KSampler (Advanced) HIGH
        // Node 16 is KSampler (Advanced) LOW
        const seed1 = Math.floor(Math.random() * 1000000000000000);
        const seed2 = Math.floor(Math.random() * 1000000000000000);

        if (workflow['15']) {
            workflow['15'].inputs.noise_seed = seed1;
        }
        if (workflow['16']) {
            workflow['16'].inputs.noise_seed = seed2;
        }

        // 5. Queue Prompt
        const queueRes = await queuePrompt(workflow);
        const promptId = queueRes.prompt_id;

        // 6. Poll for completion (Simple polling for MVP)
        // Note: This might timeout on Vercel, but for local it should be fine.
        // Ideally we return the promptId and let client poll.
        // BUT, user wants "manage videos", so we need to save the result to DB.
        // I will return the promptId and create a separate status endpoint OR just wait here if it's not too long.
        // User said "takes a few minutes". This WILL timeout on standard HTTP handlers often.
        // However, since this is a local app (Electron/Local Server), maybe the timeout is high?
        // Let's try to wait loop here. If it fails, we'll need the client polling approach.

        // Actually, better pattern:
        // Return { status: 'queued', promptId }
        // Client polls /api/videos/status?promptId=...
        // When status is done, Client calls /api/videos/save?promptId=... OR the status endpoint handles the saving.

        return NextResponse.json({ status: 'queued', promptId });

    } catch (error: any) {
        console.error('Generate error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
