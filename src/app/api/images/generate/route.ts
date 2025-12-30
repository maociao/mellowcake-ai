import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/config';
import fs from 'fs';
import path from 'path';
import { Logger } from '@/lib/logger';

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

// Helper to upload image to ComfyUI
async function uploadImageToComfy(localFilePath: string): Promise<string> {
    const fileBuffer = fs.readFileSync(localFilePath);
    const filename = path.basename(localFilePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('image', blob, filename);
    formData.append('overwrite', 'true');

    const res = await fetch(`${CONFIG.COMFY_URL}/upload/image`, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        throw new Error(`Failed to upload image to ComfyUI: ${res.statusText}`);
    }
    const data = await res.json();
    return data.name;
}

export async function POST(req: NextRequest) {
    Logger.info('[Generate API] Received generation request');
    try {
        const body = await req.json();
        Logger.debug('[Generate API] Request Body:', JSON.stringify(body, null, 2));
        const { description, useImg2Img, sourceImage, type } = body;

        // 1. Select & Prepare Workflow
        let workflowFilename = 'mellowcake_character_avatar.json'; // Default (Avatar Txt2Img)

        if (useImg2Img) {
            workflowFilename = 'mellowcake-ai-avatar-image-2-image.json';
        } else if (type === 'message') {
            workflowFilename = 'mellowcake_message_imagen.json';
        }

        Logger.debug(`[Generate API] useImg2Img: ${useImg2Img}, type: ${type}`);
        Logger.debug(`[Generate API] Selected workflow: ${workflowFilename}`);
        const workflowPath = path.join(process.cwd(), workflowFilename);

        if (!fs.existsSync(workflowPath)) {
            return NextResponse.json({ error: `Workflow file ${workflowFilename} not found` }, { status: 500 });
        }

        const workflowStr = fs.readFileSync(workflowPath, 'utf-8');
        const workflow = JSON.parse(workflowStr);

        // 2. Handle Image-to-Image Specifics
        if (useImg2Img && sourceImage) {
            // Resolve file path (sourceImage is a URL path like /api/avatars/file.png or /characters/file.png)
            const urlName = path.basename(sourceImage);

            // Check public/temp then public/characters
            let localPath = path.join(process.cwd(), 'public', 'temp', urlName);
            if (!fs.existsSync(localPath)) {
                localPath = path.join(process.cwd(), 'public', 'characters', urlName);
            }

            if (!fs.existsSync(localPath)) {
                // If we can't find it locally, we strictly can't upload it to ComfyUI easily without downloading it first 
                // (if it were external), but here we assume local files.
                throw new Error('Source image file not found on server');
            }

            const comfyFilename = await uploadImageToComfy(localPath);

            // Inject into Node 10 (Load Image)
            if (workflow['10']) {
                workflow['10'].inputs.image = comfyFilename;
            }
        }

        // 3. Inject Description (Positive Prompt - Node 6)
        if (workflow['6'] && description) {
            const currentText = workflow['6'].inputs.text || '';
            // Prepend description to existing prompt text
            workflow['6'].inputs.text = `${description}, ${currentText}`;
        }

        // 4. Randomize Seed (KSampler - Node 3)
        // Ensure we use a safe large integer
        const seed = Math.floor(Math.random() * 1000000000000000);

        if (workflow['3']) {
            workflow['3'].inputs.seed = seed;
        }

        // 5. Queue Prompt
        Logger.comfy('image-gen', workflow);
        const queueRes = await queuePrompt(workflow);
        const promptId = queueRes.prompt_id;

        return NextResponse.json({ status: 'queued', promptId });

    } catch (error: any) {
        Logger.error('Generate error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
