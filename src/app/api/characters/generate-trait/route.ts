
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { characters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { memoryService } from '@/services/memory-service';
import { llmService } from '@/services/llm-service';
import { Logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
    try {
        const { characterId, trait, currentAttributes } = await req.json();

        if (!characterId || !trait) {
            return NextResponse.json({ error: 'Missing characterId or trait' }, { status: 400 });
        }

        // 1. Fetch Character (to get name)
        const [char] = await db.select().from(characters).where(eq(characters.id, characterId));
        if (!char) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 });
        }

        // 2. Fetch Memories (Context)
        let memoriesToUse: any[] = [];
        let source = 'recent';

        // Strategy A: Context-Aware Search (if trait has content)
        const currentTraitValue = currentAttributes[trait];
        if (currentTraitValue && typeof currentTraitValue === 'string' && currentTraitValue.length > 5) {
            const searchRes = await memoryService.searchMemories(characterId, currentTraitValue, 25);
            if (searchRes.memories.length > 0) {
                memoriesToUse = searchRes.memories;
                source = 'search';
            }
        }

        // Strategy B: Fallback to Recent (if search failed or no trait content)
        if (memoriesToUse.length === 0) {
            const allMemories = await memoryService.getMemories(characterId);
            // Take top 25 recent memories.
            memoriesToUse = allMemories.slice(0, 25);
            source = 'recent';
        }

        // Sort chronologically (oldest to newest) to create a timeline
        memoriesToUse.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const relevantMemories = memoriesToUse
            .map((m: any) => {
                const date = new Date(m.createdAt).toLocaleDateString();
                return `- [${date}] ${m.content}`;
            })
            .join('\n');

        if (!relevantMemories) {
            return NextResponse.json({ error: 'No memories found to generate traits.' }, { status: 400 });
        }

        Logger.info('Generating trait using memories', { count: memoriesToUse.length, source, characterId });

        // 3. Construct Prompt
        let systemInstruction = '';
        let traitLabel = trait;

        switch (trait) {
            case 'personality':
                traitLabel = 'Personality';
                systemInstruction = `Refine the character's personality based on the timeline of recent events and known facts. Keep it CONCISE and direct (max 1-2 sentences). Focus on behaviors and quirks.`;
                break;
            case 'appearance':
                traitLabel = 'Appearance';
                systemInstruction = `Give a clinical description of the character's appearance based on the timeline of recent events and known facts. Keep it CONCISE (max 1-2 sentences). Focus on distinctive features.`;
                break;
            case 'description':
                traitLabel = 'Background Story';
                systemInstruction = `Weave the character's timeline of recent events and known facts into a cohesive background story. Keep it CONCISE (max 1-2 paragraphs)`;
                break;
            case 'scenario':
                traitLabel = 'Scenario';
                systemInstruction = `Describe the character's current situation or immediate context based on the timeline of recent events and known facts. Keep it CONCISE (max 1-2 paragraphs)`;
                break;
            case 'firstMessage':
                traitLabel = 'First Message';
                systemInstruction = `Write an engaging opening message for a new chat session, reflecting their current state and the timeline of recent events and known facts. In place of the chat user's name use {{user}}. Keep it CONCISE (max 2-3 sentences)`;
                break;
            default:
                return NextResponse.json({ error: 'Invalid trait type' }, { status: 400 });
        }

        const prompt = `
You are an expert creative writer assisting in character development.
Character Name: ${char.name}
Current ${traitLabel}: ${currentAttributes[trait] || "Not defined"}

[TIMELINE OF RECENT EVENTS / KNOWN FACTS]
${relevantMemories}

[INSTRUCTION]
${systemInstruction}
Write the content for the character's "${traitLabel}".
Do not include "Here is the ..." or markdown headers. Just the raw text.
`;

        // 4. Call LLM
        const models = await llmService.getModels();
        // Prefer a smart model
        const model = models.find((m: { name: string }) => m.name.toLowerCase().includes('stheno') || m.name.toLowerCase().includes('psy'))?.name || models[0]?.name || 'llama3:latest';

        const response = await llmService.chat(model, [{ role: 'user', content: prompt }]);
        const result = response?.trim();

        Logger.llm('generate', { trait: traitLabel, prompt, response: result, model });

        return NextResponse.json({ result });

    } catch (error) {
        Logger.error('Error generating trait:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
