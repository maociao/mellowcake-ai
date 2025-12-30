import { useState, useEffect, useRef } from 'react';
import { Logger } from '@/lib/logger';

interface Voice {
    id: number;
    name: string;
    filePath: string;
    transcript?: string;
    createdAt: string;
}

interface VoiceBankModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect?: (voiceId: number) => void;
}

export function VoiceBankModal({ isOpen, onClose, onSelect }: VoiceBankModalProps) {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [newName, setNewName] = useState('');
    const [newTranscript, setNewTranscript] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editTranscript, setEditTranscript] = useState('');

    // Audio preview state
    const [playingId, setPlayingId] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const togglePreview = (id: number, filePath: string) => {
        if (playingId === id) {
            // Stop currently playing
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            setPlayingId(null);
        } else {
            // Stop previous if exists
            if (audioRef.current) {
                audioRef.current.pause();
            }

            // Play new
            const audio = new Audio(`/voices/${filePath}`);
            audio.onended = () => setPlayingId(null);
            audio.play().catch(e => Logger.error("Playback failed", e));
            audioRef.current = audio;
            setPlayingId(id);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchVoices();
        }
    }, [isOpen]);

    const fetchVoices = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/voices');
            if (res.ok) {
                setVoices(await res.json());
            }
        } catch (e) {
            Logger.error('Fetch voices error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        if (!newName) {
            alert('Please enter a name for the voice');
            return;
        }
        formData.append('name', newName);
        if (newTranscript) formData.append('transcript', newTranscript);

        setUploading(true);
        try {
            const res = await fetch('/api/voices', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                setNewName('');
                setNewTranscript('');
                (document.getElementById('voice-upload-form') as HTMLFormElement).reset();
                fetchVoices();
            } else {
                alert('Upload failed');
            }
        } catch (e) {
            Logger.error('Upload voice error:', e);
        } finally {
            setUploading(false);
        }
    };

    const handleStartEdit = (voice: Voice) => {
        setEditingId(voice.id);
        setEditName(voice.name);
        setEditTranscript(voice.transcript || '');
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        try {
            const res = await fetch(`/api/voices/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName, transcript: editTranscript })
            });

            if (res.ok) {
                setEditingId(null);
                fetchVoices();
            } else {
                alert('Update failed');
            }
        } catch (e) {
            Logger.error('Update voice error:', e);
            alert('Error updating voice');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure? This will unassign this voice from any characters using it.')) return;
        try {
            const res = await fetch(`/api/voices/${id}`, { method: 'DELETE' });
            if (res.ok) fetchVoices();
        } catch (e) {
            Logger.error('Delete voice error:', e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Voice Bank</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>

                <div className="p-4 border-b border-gray-700 bg-gray-900">
                    <h3 className="text-sm font-semibold text-gray-300 mb-2">Add New Voice</h3>
                    <form id="voice-upload-form" onSubmit={handleUpload} className="space-y-2">
                        <div className="flex gap-2 items-start">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Voice Name</label>
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="e.g. Heroic Male"
                                    className="w-full bg-gray-800 rounded p-2 text-white text-sm border border-gray-700 focus:border-blue-500 outline-none"
                                    required
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Audio File</label>
                                <input
                                    type="file"
                                    name="file"
                                    accept="audio/*"
                                    className="w-full text-sm text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Reference Text (Transcript)</label>
                            <textarea
                                value={newTranscript}
                                onChange={e => setNewTranscript(e.target.value)}
                                placeholder="Transcription of the audio file (improves quality)..."
                                className="w-full bg-gray-800 rounded p-2 text-white text-sm border border-gray-700 focus:border-blue-500 outline-none h-16"
                            />
                        </div>
                        <div className="text-right">
                            <button
                                type="submit"
                                disabled={uploading}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
                            >
                                {uploading ? 'Uploading...' : 'Upload Voice'}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="text-center text-gray-500">Loading voices...</div>
                    ) : voices.length === 0 ? (
                        <div className="text-center text-gray-500">No voices in the bank yet.</div>
                    ) : (
                        voices.map(voice => (
                            <div key={voice.id} className="bg-gray-700/50 p-3 rounded hover:bg-gray-700 group transition-colors">
                                {editingId === voice.id ? (
                                    <div className="space-y-2">
                                        <input
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            className="w-full bg-gray-800 rounded p-1 text-white text-sm border border-gray-600"
                                            placeholder="Voice Name"
                                        />
                                        <textarea
                                            value={editTranscript}
                                            onChange={e => setEditTranscript(e.target.value)}
                                            className="w-full bg-gray-800 rounded p-1 text-white text-sm border border-gray-600 h-16"
                                            placeholder="Transcript..."
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs hover:text-white">Cancel</button>
                                            <button onClick={handleSaveEdit} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs">Save</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between items-center">
                                            <div className="font-medium text-white flex items-center gap-2">
                                                {voice.name}
                                                <button onClick={() => handleStartEdit(voice)} className="text-xs text-gray-500 hover:text-blue-400 transition-opacity">
                                                    (Edit)
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <button
                                                    onClick={() => togglePreview(voice.id, voice.filePath)}
                                                    className="p-2 bg-gray-600 hover:bg-gray-500 rounded-full text-white transition-colors"
                                                    title={playingId === voice.id ? "Stop Preview" : "Preview Voice"}
                                                >
                                                    {playingId === voice.id ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                            <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                                                        </svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                                        </svg>
                                                    )}
                                                </button>
                                                {onSelect && (
                                                    <button
                                                        onClick={() => {
                                                            onSelect(voice.id);
                                                            onClose();
                                                        }}
                                                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs"
                                                    >
                                                        Select
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(voice.id)}
                                                    className="text-red-400 hover:text-red-300 p-1 transition-opacity"
                                                    title="Delete Voice"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-500">{new Date(voice.createdAt.replace(' ', 'T')).toLocaleDateString()}</div>
                                        {voice.transcript && <div className="text-xs text-gray-400 mt-1 truncate max-w-xs">{voice.transcript}</div>}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-gray-700 text-right">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">Close</button>
                </div>
            </div>
        </div>
    );
}
