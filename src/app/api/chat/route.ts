import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/config';
import { getCharacterDetails, getPersonas, getGenerationSettings } from '@/lib/sillytavern';
import { scanLorebooks } from '@/lib/lorebook';
import { appendChatMessage, listChatSessions, createChatSession } from '@/lib/chat-history';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        let { messages, characterFilename, lorebookFilenames, personaFilename, userName = 'User', sessionFilename, save = true } = body;

        let personaDescription = '';
        if (personaFilename) {
            const personas = await getPersonas();
            const persona = personas.find(p => p.filename === personaFilename);
            if (persona) {
                userName = persona.name;
                personaDescription = persona.description || '';
            }
        }

        if (!messages || !characterFilename) {
            return new NextResponse('Missing messages or characterFilename', { status: 400 });
        }

        characterFilename = decodeURIComponent(characterFilename);

        // Save User Message
        const lastMessage = messages[messages.length - 1];
        if (save && lastMessage.role === 'user') {
            // We need a sessionFilename. If not provided, we should probably create one or use default?
            // But the frontend should provide it. If not, we'll just use default logic in appendChatMessage (which might create new if not found, or use latest)
            // Actually appendChatMessage needs a sessionFilename now.
            // Let's assume if it's missing, we fetch the latest one.
            let targetSession = sessionFilename;
            if (!targetSession) {
                const sessions = await listChatSessions(characterFilename);
                if (sessions.length > 0) targetSession = sessions[0].filename;
                else targetSession = await createChatSession(characterFilename);
            }

            if (targetSession) {
                await appendChatMessage(characterFilename, targetSession, lastMessage, undefined, userName);
            }
        }

        const character = getCharacterDetails(characterFilename);
        if (!character) {
            return new NextResponse('Character not found', { status: 404 });
        }

        // 1. Construct System Prompt
        let systemPrompt = `You are ${character.name}.\n`;
        if (character.description) systemPrompt += `${character.description}\n`;
        if (character.personality) systemPrompt += `${character.personality}\n`;
        if (character.scenario) systemPrompt += `Scenario: ${character.scenario}\n`;

        // 2. Scan and Inject Lorebooks
        // We scan the last few messages to find relevant lore
        const recentHistory = messages.slice(-5).map((m: any) => m.content).join('\n');
        const loreContent = scanLorebooks(recentHistory, lorebookFilenames || []);

        if (loreContent.length > 0) {
            systemPrompt += `\n[World Info]\n${loreContent.join('\n')}\n`;
        }

        if (character.mes_example) {
            systemPrompt += `\n[Example Dialogue]\n${character.mes_example}\n`;
        }

        if (personaDescription) {
            systemPrompt += `\n[User Persona]\n${personaDescription}\n`;
        }

        // Replace macros
        systemPrompt = systemPrompt.replace(/{{char}}/g, character.name);
        systemPrompt = systemPrompt.replace(/{{user}}/g, userName);

        // 3. Prepare Messages for Ollama
        const ollamaMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        // 4. Call Ollama
        const settings = getGenerationSettings();
        const response = await fetch(`${CONFIG.OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'fluffy/l3-8b-stheno-v3.2:latest', // Updated to available RP model
                messages: ollamaMessages,
                stream: true,
                options: {
                    num_predict: settings.max_length, // Ollama uses num_predict for max tokens
                    temperature: settings.temperature,
                    top_p: settings.top_p,
                    top_k: settings.top_k,
                    repeat_penalty: settings.rep_pen,
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Ollama Error:', errorText);
            return new NextResponse(`Ollama Error: ${response.statusText}`, { status: response.status });
        }

        // 5. Stream Response & Save to History
        if (!response.body) return new NextResponse('No response body', { status: 500 });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let assistantMessage = '';

        const stream = new ReadableStream({
            async start(controller) {
                // Send metadata first
                const meta = JSON.stringify({ type: 'meta', prompt: systemPrompt }) + '\n';
                controller.enqueue(encoder.encode(meta));

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    // Accumulate content for saving
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        try {
                            const json = JSON.parse(line);
                            if (json.message?.content) {
                                assistantMessage += json.message.content;
                            }
                        } catch (e) {
                            // ignore parse errors for chunks
                        }
                    }

                    controller.enqueue(value);
                }
                controller.close();

                // Save Assistant Message after stream completes
                if (save && assistantMessage) {
                    let targetSession = sessionFilename;
                    if (!targetSession) {
                        // Re-resolve if needed, but ideally we passed it through.
                        // For simplicity, re-fetch or use what we resolved earlier if we could scope it.
                        // We can't easily scope it here without refactoring.
                        // Let's just re-resolve.
                        const sessions = await listChatSessions(characterFilename);
                        if (sessions.length > 0) targetSession = sessions[0].filename;
                    }

                    if (targetSession) {
                        await appendChatMessage(characterFilename, targetSession, { role: 'assistant', content: assistantMessage }, systemPrompt, userName);
                    }
                }
            },
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Transfer-Encoding': 'chunked',
            }
        });

    } catch (error) {
        console.error('Chat API Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
