'use client';

import { useState } from 'react';
import { AvatarPicker } from './AvatarPicker';

interface CharacterCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (character: any) => void;
}

export function CharacterCreateModal({ isOpen, onClose, onCreated }: CharacterCreateModalProps) {
    const [loading, setLoading] = useState(false);

    // Form State for Validation
    const [name, setName] = useState('');
    const [appearance, setAppearance] = useState('');
    const [personality, setPersonality] = useState('');
    const [description, setDescription] = useState(''); // Background Story
    const [scenario, setScenario] = useState('');
    const [firstMessage, setFirstMessage] = useState('');
    const [avatarPath, setAvatarPath] = useState<string | null>(null);

    if (!isOpen) return null;

    const canCreate = name.trim().length > 0;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);

        const data = {
            name,
            description, // Background Story
            appearance,
            personality,
            scenario,
            firstMessage,
            avatarPath: avatarPath || '/placeholder.png', // Fallback if still needed or let backend handle
        };

        try {
            const res = await fetch('/api/characters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (res.ok) {
                const newChar = await res.json();
                onCreated(newChar);
                onClose();
            } else {
                alert('Failed to create character');
            }
        } catch (error) {
            console.error(error);
            alert('Error creating character');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">Create Character</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Avatar Selection */}
                    <AvatarPicker
                        currentAvatar={avatarPath}
                        onAvatarChange={setAvatarPath}
                        generateContext={appearance}
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Name <span className="text-red-500">*</span></label>
                        <input
                            name="name"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-gray-700 rounded p-2 text-white"
                            placeholder="Character Name"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Appearance (Age, gender, features)</label>
                        <input
                            name="appearance"
                            value={appearance}
                            onChange={(e) => setAppearance(e.target.value)}
                            className="w-full bg-gray-700 rounded p-2 text-white"
                            placeholder="e.g. Tall, blue eyes..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Personality</label>
                        <textarea
                            name="personality"
                            rows={2}
                            value={personality}
                            onChange={(e) => setPersonality(e.target.value)}
                            className="w-full bg-gray-700 rounded p-2 text-white"
                            placeholder="e.g. Kind, brave..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Background Story</label>
                        <textarea
                            name="description"
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-gray-700 rounded p-2 text-white"
                            placeholder="Character background..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Scenario</label>
                        <textarea
                            name="scenario"
                            rows={2}
                            value={scenario}
                            onChange={(e) => setScenario(e.target.value)}
                            className="w-full bg-gray-700 rounded p-2 text-white"
                            placeholder="Current situation..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">First Message</label>
                        <textarea
                            name="firstMessage"
                            rows={2}
                            value={firstMessage}
                            onChange={(e) => setFirstMessage(e.target.value)}
                            className="w-full bg-gray-700 rounded p-2 text-white"
                            placeholder="Hello!"
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={loading || !canCreate}
                            className={`px-4 py-2 rounded text-white transition-opacity font-medium
                                ${loading || !canCreate ? 'bg-purple-900/50 text-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500'}`}
                        >
                            {loading ? 'Creating...' : 'Create Character'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
