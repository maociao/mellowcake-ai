'use client';

import { useState } from 'react';
import { Logger } from '@/lib/logger';

interface AvatarPickerProps {
    currentAvatar: string | null;
    onAvatarChange: (path: string) => void;
    generateContext?: string; // Description for generation
}

export function AvatarPicker({ currentAvatar, onAvatarChange, generateContext }: AvatarPickerProps) {
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [genStatus, setGenStatus] = useState('');
    const [preview, setPreview] = useState<string | null>(currentAvatar);
    const [useImg2Img, setUseImg2Img] = useState(false);
    // Track base image for Img2Img to prevent chaining
    const [baseImage, setBaseImage] = useState<string | null>(null);

    // Update preview if prop changes (and we aren't in middle of something else maybe? No, let's keep it simple)
    // Actually, usually we want internal state to track prop updates or be fully controlled.
    // Let's rely on parent passing the current value primarily, but we need local state for immediate feedback if parent doesn't update immediately.
    // But here parent updates "avatarPath" state. So just using props is fine.

    // Re-sync preview when prop changes
    if (currentAvatar !== preview && !uploading && !generating) {
        setPreview(currentAvatar);
    }

    const canGenerate = generateContext && generateContext.trim().length > 0;
    const showPreview = preview && preview !== '/placeholder.png';

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('Upload failed');

            const data = await res.json();
            onAvatarChange(data.path);
            setPreview(data.path);
            if (useImg2Img) setBaseImage(data.path); // If mode is active, new upload becomes base
        } catch (error) {
            Logger.error('Upload failed:', error);
            alert('Failed to upload image');
        } finally {
            setUploading(false);
        }
    }

    async function handleGenerateAvatar() {
        if (!canGenerate) {
            alert('Please enter a description first.');
            return;
        }

        setGenerating(true);
        setGenStatus('Initializing...');

        try {
            // 1. Start Generation
            // Determine Source Image
            // If we have a locked base image, use that. 
            // If not (e.g. first run), use current preview and lock it for future runs.
            let effectiveSource = preview;
            if (useImg2Img) {
                if (baseImage) {
                    effectiveSource = baseImage;
                } else {
                    // First run of Img2Img: Lock current preview as base
                    setBaseImage(preview);
                    effectiveSource = preview;
                }
            } else {
                // Txt2Img: Reset base
                setBaseImage(null);
            }

            const res = await fetch('/api/images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: generateContext,
                    useImg2Img: useImg2Img && showPreview,
                    sourceImage: useImg2Img && showPreview ? effectiveSource : undefined
                })
            });

            if (!res.ok) throw new Error('Failed to start generation');

            const { promptId } = await res.json();
            setGenStatus('Queued...');

            // 2. Poll Status
            const poll = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/images/status?promptId=${promptId}`);
                    const statusData = await statusRes.json();

                    if (statusData.status === 'completed') {
                        clearInterval(poll);
                        setGenerating(false);
                        setGenStatus('Done!');
                        onAvatarChange(statusData.imagePath);
                        setPreview(statusData.imagePath);

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
                <label className="text-sm font-medium text-gray-400">Avatar</label>
                {showPreview && (
                    <label className="flex items-center space-x-2 text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                        <input
                            type="checkbox"
                            checked={useImg2Img}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setUseImg2Img(checked);
                                // Lock current preview as base when enabling, clear when disabling
                                setBaseImage(checked ? preview : null);
                            }}
                            className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-offset-gray-900"
                        />
                        <span>Image-to-Image</span>
                    </label>
                )}
            </div>
            <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                    <label className={`flex-1 flex items-center justify-center px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded cursor-pointer text-gray-300 text-sm border border-gray-600 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        {uploading ? 'Uploading...' : 'Upload Image'}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={uploading}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={handleGenerateAvatar}
                        disabled={generating || !canGenerate}
                        className={`px-4 py-2 rounded text-white text-sm font-medium flex items-center justify-center transition-colors
                                        ${generating ? 'bg-gray-600' : (!canGenerate ? 'bg-blue-900/50 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500')}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                        {generating ? genStatus : 'Generate'}
                    </button>
                </div>

                {showPreview && (
                    <div className="w-full h-64 relative rounded overflow-hidden border border-gray-600 bg-black/40">
                        <img src={preview!} alt="Avatar Preview" className="w-full h-full object-contain" />
                    </div>
                )}

                {/* Hidden input for form submission integration if needed */}
                <input type="hidden" name="avatarPath" value={preview || ''} />
            </div>
        </div>
    );
}
