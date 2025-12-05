import { CONFIG } from '@/config';

export interface LLMParams {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    num_predict?: number;
    num_ctx?: number;
    stop?: string[];
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export const llmService = {
    async getModels() {
        try {
            const response = await fetch(`${CONFIG.OLLAMA_URL}/api/tags`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            return data.models;
        } catch (error) {
            console.error('Error fetching models:', error);
            return [];
        }
    },

    async getModelInfo(model: string) {
        try {
            const response = await fetch(`${CONFIG.OLLAMA_URL}/api/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: model }),
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Error fetching model info:', error);
            return null;
        }
    },

    async chat(model: string, messages: ChatMessage[], params: LLMParams = {}) {
        try {
            const response = await fetch(`${CONFIG.OLLAMA_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages,
                    stream: false, // For now, no streaming to simplify logic
                    options: {
                        temperature: params.temperature,
                        top_p: params.top_p,
                        top_k: params.top_k,
                        repeat_penalty: params.repeat_penalty,
                        num_predict: params.num_predict,
                        num_ctx: params.num_ctx,
                        stop: params.stop,
                    }
                }),
            });

            if (!response.ok) throw new Error('Failed to generate response');

            const data = await response.json();
            return data.message.content;
        } catch (error) {
            console.error('Error calling Ollama:', error);
            throw error;
        }
    },

    async generate(model: string, prompt: string, params: LLMParams = {}) {
        try {
            const response = await fetch(`${CONFIG.OLLAMA_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: false,
                    options: {
                        temperature: params.temperature,
                        top_p: params.top_p,
                        top_k: params.top_k,
                        repeat_penalty: params.repeat_penalty,
                        num_predict: params.num_predict,
                        num_ctx: params.num_ctx,
                        stop: params.stop,
                    }
                }),
            });

            if (!response.ok) throw new Error('Failed to generate response');

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('Error calling Ollama generate:', error);
            throw error;
        }
    },

    // Streaming version could be added here
};
