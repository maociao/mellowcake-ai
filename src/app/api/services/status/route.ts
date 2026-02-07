import { NextResponse } from 'next/server';

export async function GET() {
    const services = [
        { name: 'Ollama', url: 'http://localhost:11434', type: 'ollama' },
        { name: 'Hindsight', url: 'http://localhost:8888/health', type: 'hindsight' },
        { name: 'F5-TTS', url: 'http://localhost:8000/docs', type: 'f5-tts' }, // distinct from other health checks
        { name: 'ComfyUI', url: 'http://localhost:8188/system_stats', type: 'comfyui' }
    ];

    const results = await Promise.all(services.map(async (service) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout

            const response = await fetch(service.url, {
                method: service.type === 'f5-tts' ? 'HEAD' : 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            return {
                name: service.name,
                status: response.ok ? 'online' : 'error',
                code: response.status
            };
        } catch (error) {
            return {
                name: service.name,
                status: 'offline',
                error: (error as Error).message
            };
        }
    }));

    // Check if the current app (Mellowcake AI) is running (implied if this API responds)
    results.unshift({
        name: 'Mellowcake AI',
        status: 'online',
        code: 200
    });

    return NextResponse.json({ services: results });
}
