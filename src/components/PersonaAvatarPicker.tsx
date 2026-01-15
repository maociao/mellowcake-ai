'use client';

import { useState } from 'react';
import { Logger } from '@/lib/logger';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

interface PersonaAvatarPickerProps {
    currentAvatar: string | null;
    onAvatarChange: (path: string) => void;
}

export function PersonaAvatarPicker({ currentAvatar, onAvatarChange }: PersonaAvatarPickerProps) {
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [genStatus, setGenStatus] = useState('');
    const [preview, setPreview] = useState<string | null>(currentAvatar);
    const [prompt, setPrompt] = useState('');
    const [showPromptInput, setShowPromptInput] = useState(false);

    // Re-sync preview when prop changes
    if (currentAvatar !== preview && !uploading && !generating) {
        setPreview(currentAvatar);
    }

    const showPreview = preview && preview !== '/placeholder.png';

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'personas');

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('Upload failed');

            const data = await res.json();
            onAvatarChange(data.path);
            setPreview(data.path);
        } catch (error) {
            Logger.error('Upload failed:', error);
            alert('Failed to upload image');
        } finally {
            setUploading(false);
        }
    }

    async function handleGenerateAvatar() {
        if (!prompt.trim()) {
            alert('Please enter a description for the image.');
            return;
        }

        setGenerating(true);
        setGenStatus('Initializing...');

        try {
            // 1. Start Generation
            const res = await fetch('/api/images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: prompt,
                    type: 'avatar' // Using 'avatar' logic or default
                })
            });

            if (!res.ok) throw new Error('Failed to start generation');

            const { promptId } = await res.json();
            setGenStatus('Queued...');

            // 2. Poll Status
            const poll = setInterval(async () => {
                try {
                    // Include folder=personas to save to correct location
                    const statusRes = await fetch(`/api/images/status?promptId=${promptId}&folder=personas`);
                    const statusData = await statusRes.json();

                    if (statusData.status === 'completed') {
                        clearInterval(poll);
                        setGenerating(false);
                        setGenStatus('Done!');
                        onAvatarChange(statusData.imagePath);
                        setPreview(statusData.imagePath);
                        setShowPromptInput(false); // Hide prompt input on success
                    } else if (statusData.status === 'failed' || statusData.status === 'unknown') {
                        clearInterval(poll);
                        setGenerating(false);
                        setGenStatus('Failed');
                        alert(`Generation failed: ${statusData.error || 'Unknown error'}`);
                    } else {
                        setGenStatus('Generating...');
                    }
                } catch (e) {
                    Logger.error('Polling error:', e);
                    clearInterval(poll);
                    setGenerating(false);
                    setGenStatus('Error polling');
                }
            }, 2000);

        } catch (e) {
            Logger.error('Generation start error:', e);
            setGenerating(false);
            setGenStatus('Error starting');
            alert('Failed to start generation');
        }
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-400">Avatar Image</label>
                    <HelpTooltip text="Upload an image or generate one for this persona. Images are saved to public/personas." />
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                    <label className={`flex-1 flex items-center justify-center px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded cursor-pointer text-gray-300 text-sm border border-gray-600 transition-colors ${uploading || generating ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        {uploading ? 'Uploading...' : 'Upload'}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={uploading || generating}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={() => setShowPromptInput(!showPromptInput)}
                        disabled={uploading || generating}
                        className={`px-4 py-2 rounded text-white text-sm font-medium flex items-center justify-center transition-colors
                                ${showPromptInput ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600 border border-gray-600'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                        Generate
                    </button>
                </div>

                {showPromptInput && (
                    <div className="bg-gray-800 p-3 rounded border border-gray-600 animate-in slide-in-from-top-2 fade-in duration-200">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="w-full bg-gray-900 text-white rounded p-2 text-sm border border-gray-700 focus:border-blue-500 outline-none mb-2"
                            placeholder="Describe the avatar (e.g. 'A futuristic cyborg profile portrait')..."
                            rows={2}
                        />
                        <button
                            type="button"
                            onClick={handleGenerateAvatar}
                            disabled={generating || !prompt.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white py-1 rounded text-sm transition-colors"
                        >
                            {generating ? genStatus : 'Create Avatar'}
                        </button>
                    </div>
                )}

                {showPreview && (
                    <div className="w-full h-64 relative rounded overflow-hidden border border-gray-600 bg-black/40">
                        <img src={preview!} alt="Avatar Preview" className="w-full h-full object-contain" />
                    </div>
                )}

                {/* Hidden input for form submission integration */}
                <input type="hidden" name="avatarPath" value={preview || ''} />
            </div>
        </div>
    );
}
