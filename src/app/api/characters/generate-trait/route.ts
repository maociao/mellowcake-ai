
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { characters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { memoryService } from '@/services/memory-service';
import { llmService } from '@/services/llm-service';
import { Logger } from '@/lib/logger';
import { CONFIG } from '@/config';

export async function POST(req: NextRequest) {
    try {
        const { characterId, trait } = await req.json();

        if (!characterId || !trait) {
            return NextResponse.json({ error: 'Missing characterId or trait' }, { status: 400 });
        }

        // Fetch Character to get name
        const [char] = await db.select().from(characters).where(eq(characters.id, characterId));
        if (!char) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 });
        }

        let query = '';
        switch (trait) {
            case 'personality':
                query = "Reflect on {{char}}'s behavior, speech patterns, and specific traits based on recent interactions. What is {{char}}'s personality? Keep it concise. Comma seperated list of up to 10 traits.";
                break;
            case 'appearance':
                query = "Reflect on {{char}}'s physical description based on self-references and feedback. What does {{char}} look like? Keep it concise. Comma seperated list of up to 10 physical traits.";
                break;
            case 'description':
                query = "Reflect on {{char}}'s life history, key events, relationships, and evolution. Write a cohesive backstory summary in third person point of view (max 2 paragraphs).";
                break;
            case 'scenario':
                query = "Reflect on {{char}}'s current situation, location, and immediate surroundings based on recent context. What is the setting? Keep it concise.";
                break;
            case 'firstMessage':
                query = "Reflect on {{char}}'s current state. Write an engaging opening message for a new chat session. Use {{user}} placeholder.";
                break;
            default:
                return NextResponse.json({ error: 'Invalid trait type' }, { status: 400 });
        }

        // Replace placeholder
        query = query.replaceAll('{{char}}', char.name);

        Logger.info(`[Trait Gen] Reflecting on ${trait} for char ${characterId}: "${query}"`);
        const reflection = await memoryService.reflect(characterId, query);

        if (!reflection) {
            return NextResponse.json({ error: 'Failed to generate reflection' }, { status: 500 });
        }

        let resultText = '';
        if (typeof reflection === 'string') {
            resultText = reflection;
        } else if (typeof reflection === 'object') {
            // Handle Hindsight return types
            if ('content' in reflection) resultText = (reflection as any).content;
            else if ('text' in reflection) resultText = (reflection as any).text;
            else resultText = JSON.stringify(reflection);
        }

        return NextResponse.json({ result: resultText });

    } catch (error) {
        Logger.error('Error generating trait:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
