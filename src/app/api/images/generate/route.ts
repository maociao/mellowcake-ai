
import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/config';
import fs from 'fs';
import path from 'path';

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

export async function POST(req: NextRequest) {
    try {
        const { description } = await req.json();

        // 1. Prepare Workflow
        const workflowPath = path.join(process.cwd(), 'mellowcake_character_avatar.json');

        if (!fs.existsSync(workflowPath)) {
            return NextResponse.json({ error: 'Avatar workflow file not found' }, { status: 500 });
        }

        const workflowStr = fs.readFileSync(workflowPath, 'utf-8');
        const workflow = JSON.parse(workflowStr);

        // 2. Inject Description (Positive Prompt - Node 6)
        if (workflow['6'] && description) {
            const currentText = workflow['6'].inputs.text || '';
            // Prepend description to existing prompt text
            workflow['6'].inputs.text = `${description}, ${currentText}`;
        }

        // 3. Randomize Seed (KSampler - Node 3)
        // Ensure we use a safe large integer
        const seed = Math.floor(Math.random() * 1000000000000000);

        if (workflow['3']) {
            workflow['3'].inputs.seed = seed;
        }

        // 4. Queue Prompt
        const queueRes = await queuePrompt(workflow);
        const promptId = queueRes.prompt_id;

        return NextResponse.json({ status: 'queued', promptId });

    } catch (error: any) {
        console.error('Generate error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
