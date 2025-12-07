'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    promptUsed?: string;
    name?: string;
    id?: number;
    swipes?: string; // JSON string
    currentIndex?: number;
}

interface CharacterDetails {
    id: number;
    name: string;
    avatarPath: string;
    description?: string;
    firstMessage?: string;
    scenario?: string;
    systemPrompt?: string;
    personality?: string;
    lorebooks?: string; // JSON string
}

interface ChatSession {
    id: number;
    name: string;
    updatedAt: string;
    personaId?: number;
}

interface Persona {
    id: number;
    name: string;
    description?: string;
    avatarPath?: string;
    characterId?: number;
}

interface LorebookEntry {
    id: number;
    label: string;
    content: string;
    keywords: string; // JSON string
    weight: number;
    enabled: boolean;
}

interface Lorebook {
    id: number;
    name: string;
    description?: string;
    entries?: LorebookEntry[];
}

export default function ChatPage() {
    const params = useParams();
    const characterId = parseInt(params.id as string);
    const router = useRouter();

    const [character, setCharacter] = useState<CharacterDetails | null>(null);
    const [allCharacters, setAllCharacters] = useState<CharacterDetails[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Session State
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
    const [showSessions, setShowSessions] = useState(false);
    const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
    const [editSessionName, setEditSessionName] = useState('');

    // Settings State
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
    const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
    const [selectedLorebooks, setSelectedLorebooks] = useState<string[]>([]); // Using names
    const [showSettings, setShowSettings] = useState(false);

    // Edit Modals State
    const [showCharEdit, setShowCharEdit] = useState(false);
    const [showPersonaEdit, setShowPersonaEdit] = useState<Persona | 'new' | null>(null);
    const [showLorebookManage, setShowLorebookManage] = useState(false);
    const [editingLorebook, setEditingLorebook] = useState<Lorebook | 'new' | null>(null);
    const [editingEntry, setEditingEntry] = useState<LorebookEntry | 'new' | null>(null);

    // Prompt Inspection State
    const [viewingPrompt, setViewingPrompt] = useState<string | null>(null);
    const [charEditTab, setCharEditTab] = useState<'details' | 'memories' | 'videos'>('details');

    // --- Memory Editor Component ---
    function MemoryEditor({ characterId }: { characterId: number }) {
        const [memories, setMemories] = useState<any[]>([]);
        const [loading, setLoading] = useState(true);
        const [newContent, setNewContent] = useState('');
        const [newKeywords, setNewKeywords] = useState('');

        useEffect(() => {
            fetchMemories();
        }, [characterId]);

        const fetchMemories = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/memories?characterId=${characterId}`);
                if (res.ok) setMemories(await res.json());
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        const createMemory = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!newContent) return;
            try {
                const res = await fetch('/api/memories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        characterId,
                        content: newContent,
                        keywords: newKeywords.split(',').map(k => k.trim()).filter(k => k)
                    })
                });
                if (res.ok) {
                    setNewContent('');
                    setNewKeywords('');
                    fetchMemories();
                }
            } catch (e) {
                console.error(e);
            }
        };

        const deleteMemory = async (id: number) => {
            if (!confirm('Delete this memory?')) return;
            try {
                const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
                if (res.ok) fetchMemories();
            } catch (e) {
                console.error(e);
            }
        };

        return (
            <div className="space-y-4">
                <div className="bg-gray-700 p-4 rounded">
                    <h4 className="font-bold mb-2">Add New Memory</h4>
                    <form onSubmit={createMemory} className="space-y-2">
                        <input
                            placeholder="Memory Content (e.g. User likes apples)"
                            className="w-full bg-gray-800 rounded p-2 text-white"
                            value={newContent}
                            onChange={e => setNewContent(e.target.value)}
                        />
                        <input
                            placeholder="Keywords (comma separated)"
                            className="w-full bg-gray-800 rounded p-2 text-white"
                            value={newKeywords}
                            onChange={e => setNewKeywords(e.target.value)}
                        />
                        <button type="submit" className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm">Add Memory</button>
                    </form>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {loading ? <p className="text-gray-400">Loading...</p> : memories.map(mem => (
                        <div key={mem.id} className="bg-gray-700 p-3 rounded flex justify-between items-start group">
                            <div>
                                <div className="text-sm text-white mb-1">{mem.content}</div>
                                <div className="text-xs text-gray-400 font-mono mb-1">
                                    {JSON.parse(mem.keywords || '[]').join(', ')}
                                </div>
                                <div className="text-[10px] text-gray-500">
                                    {new Date(mem.createdAt).toLocaleString()}
                                </div>
                            </div>
                            <button onClick={() => deleteMemory(mem.id)} className="text-red-400 hover:text-red-300 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                            </button>
                        </div>
                    ))}
                    {!loading && memories.length === 0 && <p className="text-gray-500 text-center">No memories found.</p>}
                </div>
            </div>
        );
    }

    // --- Video Manager Component ---
    function VideoManager({ characterId }: { characterId: number }) {
        const [videos, setVideos] = useState<any[]>([]);
        const [loading, setLoading] = useState(true);
        const [generating, setGenerating] = useState(false);
        const [status, setStatus] = useState<string>('');

        useEffect(() => {
            fetchVideos();
        }, [characterId]);

        const fetchVideos = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/videos?characterId=${characterId}`);
                if (res.ok) setVideos(await res.json());
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        const generateVideo = async () => {
            if (generating) return;
            setGenerating(true);
            setStatus('Initializing generation...');
            try {
                const res = await fetch('/api/videos/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ characterId })
                });

                if (!res.ok) throw new Error('Failed to start generation');

                const { promptId } = await res.json();
                setStatus('Queued in ComfyUI...');

                // Poll for status
                const poll = setInterval(async () => {
                    try {
                        const statusRes = await fetch(`/api/videos/status?promptId=${promptId}&characterId=${characterId}`);
                        const statusData = await statusRes.json();

                        if (statusData.status === 'completed') {
                            clearInterval(poll);
                            setGenerating(false);
                            setStatus('Generation complete!');
                            fetchVideos();
                            setTimeout(() => setStatus(''), 3000);
                        } else if (statusData.status === 'failed' || statusData.status === 'unknown') {
                            clearInterval(poll);
                            setGenerating(false);
                            setStatus(`Generation failed: ${statusData.error || 'Unknown error'}`);
                        } else {
                            setStatus('Generating... (this may take a few minutes)');
                        }
                    } catch (e) {
                        console.error('Polling error', e);
                    }
                }, 5000); // Poll every 5 seconds

            } catch (e: any) {
                console.error(e);
                setGenerating(false);
                setStatus(`Error: ${e.message}`);
            }
        };

        const deleteVideo = async (id: number) => {
            if (!confirm('Delete this video?')) return;
            try {
                const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
                if (res.ok) fetchVideos();
            } catch (e) {
                console.error(e);
            }
        };

        const setDefault = async (id: number) => {
            try {
                const res = await fetch(`/api/videos/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isDefault: true })
                });
                if (res.ok) fetchVideos();
            } catch (e) {
                console.error(e);
            }
        };

        return (
            <div className="space-y-4">
                <div className="bg-gray-700 p-4 rounded">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold">Character Videos</h4>
                        <button
                            onClick={generateVideo}
                            disabled={generating}
                            className={`px-4 py-2 rounded text-white text-sm ${generating ? 'bg-gray-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500'}`}
                        >
                            {generating ? 'Generating...' : 'Generate New Video'}
                        </button>
                    </div>
                    {status && <div className="text-sm text-yellow-400 mb-4 animate-pulse">{status}</div>}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
                        {loading ? <p className="text-gray-400">Loading...</p> : videos.map(video => (
                            <div key={video.id} className="bg-gray-800 p-2 rounded relative group">
                                <video
                                    src={video.filePath}
                                    className="w-full aspect-[3/2] object-cover rounded bg-black"
                                    controls
                                    preload="metadata"
                                />
                                <div className="mt-2 flex justify-between items-center">
                                    <div className="text-xs text-gray-400">{new Date(video.createdAt).toLocaleString()}</div>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => setDefault(video.id)}
                                            className={`text-xs px-2 py-1 rounded ${video.isDefault ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                                            disabled={video.isDefault}
                                        >
                                            {video.isDefault ? 'Default' : 'Set Default'}
                                        </button>
                                        <button onClick={() => deleteVideo(video.id)} className="text-red-400 hover:text-red-300 p-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {!loading && videos.length === 0 && <p className="text-gray-500 col-span-2 text-center py-4">No videos generated yet.</p>}
                    </div>
                </div>
            </div>
        );
    }

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load Data
    const loadData = async () => {
        try {
            // 1. Get Character
            const charRes = await fetch(`/api/characters/${characterId}`);
            if (charRes.ok) {
                const charData = await charRes.json();
                setCharacter(charData);

                // 1b. Get All Characters (for linking)
                const allCharsRes = await fetch('/api/characters');
                if (allCharsRes.ok) {
                    setAllCharacters(await allCharsRes.json());
                }

                // 2. Get Sessions
                const sessionsRes = await fetch(`/api/chats?characterId=${characterId}`);
                if (sessionsRes.ok) {
                    const sessionsData = await sessionsRes.json();
                    setSessions(sessionsData);

                    if (!currentSessionId && sessionsData.length > 0) {
                        selectSession(sessionsData[0].id);
                    } else if (!currentSessionId) {
                        createNewSession();
                    }
                }
            }

            // 3. Get Personas
            const personasRes = await fetch('/api/personas');
            if (personasRes.ok) {
                setPersonas(await personasRes.json());
            }

            // 4. Get Lorebooks
            const loreRes = await fetch('/api/lorebooks');
            if (loreRes.ok) {
                setLorebooks(await loreRes.json());
            }

        } catch (err) {
            console.error('Failed to load data:', err);
        }
    };

    useEffect(() => {
        if (isNaN(characterId)) return;
        loadData();
    }, [characterId]);

    const selectSession = async (sessionId: number) => {
        setCurrentSessionId(sessionId);
        setShowSessions(false);
        try {
            const res = await fetch(`/api/chats/${sessionId}`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data.messages);
                if (data.session.personaId) {
                    setSelectedPersonaId(data.session.personaId);
                }
                // Load session lorebooks, or fall back to character defaults
                if (data.session.lorebooks) {
                    try {
                        setSelectedLorebooks(JSON.parse(data.session.lorebooks));
                    } catch (e) {
                        console.error('Error parsing session lorebooks', e);
                    }
                } else if (character?.lorebooks) {
                    try {
                        setSelectedLorebooks(JSON.parse(character.lorebooks));
                    } catch (e) {
                        console.error('Error parsing character default lorebooks', e);
                    }
                } else {
                    setSelectedLorebooks([]);
                }
            }
        } catch (e) {
            console.error('Failed to load session', e);
        }
    };

    const createNewSession = async () => {
        try {
            const res = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId,
                    name: `Chat ${new Date().toLocaleDateString()}`,
                    personaId: selectedPersonaId
                })
            });
            if (res.ok) {
                const newSession = await res.json();
                setSessions(prev => [newSession, ...prev]);
                await selectSession(newSession.id);
            }
        } catch (e) {
            console.error('Failed to create session', e);
        }
    };

    const toggleLorebook = async (name: string) => {
        const newSelection = selectedLorebooks.includes(name)
            ? selectedLorebooks.filter(f => f !== name)
            : [...selectedLorebooks, name];

        setSelectedLorebooks(newSelection);

        // If we have an active session, save the selection to it
        if (currentSessionId) {
            try {
                await fetch(`/api/chats/${currentSessionId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lorebooks: newSelection })
                });
            } catch (e) {
                console.error('Failed to save session lorebooks', e);
            }
        }
    };

    const renameSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSessionId || !editSessionName.trim()) return;

        try {
            const res = await fetch(`/api/chats/${editingSessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editSessionName })
            });

            if (res.ok) {
                setSessions(prev => prev.map(s => s.id === editingSessionId ? { ...s, name: editSessionName } : s));
                setEditingSessionId(null);
            }
        } catch (e) {
            console.error('Failed to rename session', e);
        }
    };

    const deleteSession = async (id: number) => {
        if (!confirm('Are you sure you want to delete this chat session? This cannot be undone.')) return;

        try {
            const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setSessions(prev => prev.filter(s => s.id !== id));
                if (currentSessionId === id) {
                    setCurrentSessionId(null);
                    setMessages([]);
                    // Optionally load another session or create new
                    if (sessions.length > 1) {
                        const next = sessions.find(s => s.id !== id);
                        if (next) selectSession(next.id);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to delete session', e);
        }
    };



    // Update character defaults
    const updateCharacter = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!character) return;
        const formData = new FormData(e.currentTarget);

        // Handle multi-select for lorebooks
        const lorebooks = formData.getAll('lorebooks') as string[];
        const updates: any = Object.fromEntries(formData.entries());
        updates.lorebooks = lorebooks; // Override the single value from Object.fromEntries

        try {
            const res = await fetch(`/api/characters/${character.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (res.ok) {
                const updated = await res.json();
                setCharacter(updated);
                setShowCharEdit(false);
            }
        } catch (e) {
            console.error('Failed to update character', e);
        }
    };

    const savePersona = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data: any = Object.fromEntries(formData.entries());

        // Handle characterId
        if (data.characterId) {
            data.characterId = parseInt(data.characterId as string);
        } else {
            data.characterId = null;
        }

        try {
            let res;
            if (showPersonaEdit === 'new') {
                res = await fetch('/api/personas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else if (showPersonaEdit && typeof showPersonaEdit !== 'string') {
                res = await fetch(`/api/personas/${showPersonaEdit.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }

            if (res?.ok) {
                loadData(); // Reload personas
                setShowPersonaEdit(null);
            }
        } catch (e) {
            console.error('Failed to save persona', e);
        }
    };

    const loadLorebookDetails = async (id: number) => {
        try {
            const res = await fetch(`/api/lorebooks/${id}`);
            if (res.ok) {
                const data = await res.json();
                setEditingLorebook(data);
            }
        } catch (e) {
            console.error('Failed to load lorebook details', e);
        }
    };

    const saveLorebook = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());

        try {
            let res;
            if (editingLorebook === 'new') {
                res = await fetch('/api/lorebooks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else if (editingLorebook && typeof editingLorebook !== 'string') {
                res = await fetch(`/api/lorebooks/${editingLorebook.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }

            if (res?.ok) {
                const saved = await res.json();
                loadData(); // Reload list
                setEditingLorebook(saved); // Update current view
            }
        } catch (e) {
            console.error('Failed to save lorebook', e);
        }
    };

    const saveEntry = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingLorebook || typeof editingLorebook === 'string') return;

        const formData = new FormData(e.currentTarget);
        const data = {
            label: formData.get('label') as string,
            content: formData.get('content') as string,
            keywords: JSON.stringify((formData.get('keywords') as string).split(',').map(k => k.trim()).filter(k => k)),
            weight: parseInt(formData.get('weight') as string) || 5,
            enabled: formData.get('enabled') === 'on'
        };

        try {
            let res;
            if (editingEntry === 'new') {
                res = await fetch(`/api/lorebooks/${editingLorebook.id}/entries`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else if (editingEntry && typeof editingEntry !== 'string') {
                res = await fetch(`/api/lorebooks/entries/${editingEntry.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }

            if (res?.ok) {
                loadLorebookDetails(editingLorebook.id); // Reload entries
                setEditingEntry(null);
            }
        } catch (e) {
            console.error('Failed to save entry', e);
        }
    };

    const deleteEntry = async (id: number) => {
        if (!editingLorebook || typeof editingLorebook === 'string') return;
        if (!confirm('Are you sure you want to delete this entry?')) return;

        try {
            const res = await fetch(`/api/lorebooks/entries/${id}`, { method: 'DELETE' });
            if (res.ok) {
                loadLorebookDetails(editingLorebook.id);
            }
        } catch (e) {
            console.error('Failed to delete entry', e);
        }
    };

    // Helper to format message content (italics for *text*)
    const formatMessage = (content: string) => {
        // Replace variables
        let formatted = content;
        if (character) {
            formatted = formatted.replace(/{{char}}/gi, character.name);
        }

        const currentPersona = personas.find(p => p.id === selectedPersonaId);
        const userName = currentPersona?.name || 'User';
        formatted = formatted.replace(/{{user}}/gi, userName);

        const parts = formatted.split(/(\*[^*]+\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={index} className="text-blue-200">{part.slice(1, -1)}</em>;
            }
            return <span key={index}>{part}</span>;
        });
    };

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);



    const handleRegenerate = async (messageId: number) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const res = await fetch('/api/chat/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId })
            });
            if (res.ok) {
                const updatedMsg = await res.json();
                setMessages(prev => prev.map(m => (m.id === messageId ? updatedMsg : m)));
            }
        } catch (e) {
            console.error('Failed to regenerate', e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSwipe = async (messageId: number, direction: 'left' | 'right') => {
        try {
            const res = await fetch(`/api/messages/${messageId}/swipe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction })
            });
            if (res.ok) {
                const updatedMsg = await res.json();
                setMessages(prev => prev.map(m => (m.id === messageId ? updatedMsg : m)));
            }
        } catch (e) {
            console.error('Failed to swipe', e);
        }
    };

    const deleteMessage = async (id: number) => {
        if (!confirm('Are you sure you want to delete this message? All subsequent messages will also be deleted.')) return;

        try {
            const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
            if (res.ok) {
                // Remove deleted messages from state
                setMessages(prev => {
                    const index = prev.findIndex(m => (m as any).id === id);
                    if (index !== -1) {
                        return prev.slice(0, index);
                    }
                    return prev;
                });
            }
        } catch (e) {
            console.error('Failed to delete message', e);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || isLoading || !currentSessionId) return;

        const currentPersona = personas.find(p => p.id === selectedPersonaId);
        const userMessage: Message = {
            role: 'user',
            content: input,
            name: currentPersona?.name || 'User'
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    content: userMessage.content,
                    personaId: selectedPersonaId,
                    lorebooks: selectedLorebooks
                }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const { userMessage: savedUserMsg, assistantMessage: assistantMsg } = await response.json();

            // Update messages: Replace the optimistic user message (last one) with the saved one, and add assistant message
            setMessages(prev => {
                const newMessages = [...prev];
                // Replace the last message (optimistic user message) with the saved one containing the ID
                newMessages[newMessages.length - 1] = savedUserMsg;
                return [...newMessages, assistantMsg];
            });
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get response.' }]);
        } finally {
            setIsLoading(false);
        }
    };



    const handleImpersonate = async () => {
        if (isLoading || !currentSessionId) return;
        setIsLoading(true);
        try {
            const res = await fetch('/api/chat/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    personaId: selectedPersonaId
                })
            });
            if (res.ok) {
                const data = await res.json();
                setInput(data.content);
            }
        } catch (e) {
            console.error('Failed to impersonate', e);
        } finally {
            setIsLoading(false);
        }
    };

    const currentPersona = personas.find(p => p.id === selectedPersonaId);

    if (!character) {
        return <div className="p-4 text-center text-white">Loading...</div>;
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white">
            {/* Header */}
            <header className="flex items-center p-3 bg-gray-800 border-b border-gray-700 shadow-md z-10">
                <Link href="/" className="mr-3 text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                </Link>
                <div className="relative w-10 h-10 rounded-full overflow-hidden mr-3 cursor-pointer" onClick={() => setShowCharEdit(true)}>
                    <Image src={character.avatarPath || '/placeholder.png'} alt={character.name} fill className="object-cover" unoptimized />
                </div>
                <div className="flex-1 overflow-hidden">
                    <h1 className="font-semibold text-lg truncate cursor-pointer hover:text-blue-400" onClick={() => setShowCharEdit(true)}>{character.name}</h1>
                    <button onClick={() => setShowSessions(!showSessions)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center">
                        {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.name || `Session #${currentSessionId}` : 'New Session'}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 ml-1">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
                <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                </button>
            </header>

            {/* Sessions Modal */}
            {showSessions && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Chat Sessions</h2>
                            <button onClick={() => setShowSessions(false)} className="text-gray-400 hover:text-white">Close</button>
                        </div>
                        <button onClick={createNewSession} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg mb-4">New Chat</button>
                        <div className="space-y-2">
                            {sessions.map(session => (
                                <div key={session.id} className="flex items-center space-x-2">
                                    {editingSessionId === session.id ? (
                                        <form onSubmit={renameSession} className="flex-1 flex space-x-2">
                                            <input
                                                autoFocus
                                                className="flex-1 bg-gray-700 rounded px-2 py-1 text-white"
                                                value={editSessionName}
                                                onChange={e => setEditSessionName(e.target.value)}
                                                onBlur={() => setEditingSessionId(null)}
                                            />
                                            <button type="submit" className="text-green-400">Save</button>
                                        </form>
                                    ) : (
                                        <button
                                            onClick={() => selectSession(session.id)}
                                            className={`flex-1 min-w-0 text-left p-3 rounded-lg border ${currentSessionId === session.id ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 hover:bg-gray-700'}`}
                                        >
                                            <div className="font-medium truncate">{session.name || `Session ${session.id}`}</div>
                                            <div className="text-xs text-gray-400">{new Date(session.updatedAt).toLocaleString()}</div>
                                        </button>
                                    )}
                                    <button onClick={() => { setEditingSessionId(session.id); setEditSessionName(session.name); }} className="p-2 text-gray-400 hover:text-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                    </button>
                                    <button onClick={() => deleteSession(session.id)} className="p-2 text-gray-400 hover:text-red-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Character Edit Modal */}
            {/* Character Edit Modal */}
            {showCharEdit && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Edit Character</h2>
                            <button onClick={() => setShowCharEdit(false)} className="text-gray-400 hover:text-white">Close</button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-700 mb-4">
                            <button type="button" onClick={() => setCharEditTab('details')} className={`px-4 py-2 ${charEditTab === 'details' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}>Details</button>
                            <button type="button" onClick={() => setCharEditTab('memories')} className={`px-4 py-2 ${charEditTab === 'memories' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}>Memories</button>
                            <button type="button" onClick={() => setCharEditTab('videos')} className={`px-4 py-2 ${charEditTab === 'videos' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}>Videos</button>
                        </div>

                        {charEditTab === 'details' ? (
                            <form onSubmit={updateCharacter} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Name</label>
                                    <input name="name" defaultValue={character.name} className="w-full bg-gray-700 rounded p-2 text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Description</label>
                                    <textarea name="description" defaultValue={character.description} rows={3} className="w-full bg-gray-700 rounded p-2 text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Personality</label>
                                    <textarea name="personality" defaultValue={character.personality} rows={2} className="w-full bg-gray-700 rounded p-2 text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Scenario</label>
                                    <textarea name="scenario" defaultValue={character.scenario} rows={3} className="w-full bg-gray-700 rounded p-2 text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">First Message</label>
                                    <textarea name="firstMessage" defaultValue={character.firstMessage} rows={4} className="w-full bg-gray-700 rounded p-2 text-white font-mono text-sm" />
                                </div>

                                {/* Default Lorebooks */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Default Lorebooks</label>
                                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto bg-gray-700 p-2 rounded">
                                        {lorebooks.map(lb => (
                                            <label key={lb.id} className="flex items-center space-x-2 p-1 hover:bg-gray-600 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    name="lorebooks"
                                                    value={lb.name}
                                                    defaultChecked={character.lorebooks?.includes(lb.name)}
                                                    className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500"
                                                />
                                                <span className="text-sm truncate" title={lb.name}>{lb.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Save Changes</button>
                                </div>
                            </form>
                        ) : charEditTab === 'memories' ? (
                            <MemoryEditor characterId={character.id} />
                        ) : (
                            <VideoManager characterId={character.id} />
                        )}
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {
                showSettings && (
                    <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold">Settings</h2>
                                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">Close</button>
                            </div>

                            {/* Personas */}
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-semibold text-gray-400 text-sm uppercase tracking-wider">Persona</h3>
                                    <button onClick={() => setShowPersonaEdit('new')} className="text-xs text-blue-400 hover:text-blue-300">+ New</button>
                                </div>
                                <div className="space-y-2">
                                    {personas.map(p => (
                                        <div key={p.id} className="flex items-center space-x-2">
                                            <button
                                                onClick={() => setSelectedPersonaId(p.id)}
                                                className={`flex-1 text-left p-2 rounded flex items-center space-x-3 ${selectedPersonaId === p.id ? 'bg-blue-900/40 text-blue-100' : 'hover:bg-gray-700'}`}
                                            >
                                                <div className="w-8 h-8 rounded-full overflow-hidden relative bg-gray-600 flex-shrink-0">
                                                    {p.avatarPath ? (
                                                        <Image src={p.avatarPath} alt={p.name} fill className="object-cover" unoptimized />
                                                    ) : (
                                                        <div className="flex items-center justify-center h-full text-xs">{p.name[0]}</div>
                                                    )}
                                                </div>
                                                <span className="truncate">{p.name}</span>
                                            </button>
                                            <button onClick={() => setShowPersonaEdit(p)} className="p-2 text-gray-400 hover:text-white">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Lorebooks */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-semibold text-gray-400 text-sm uppercase tracking-wider">Memory Books</h3>
                                    <button onClick={() => setShowLorebookManage(true)} className="text-xs text-blue-400 hover:text-blue-300">Manage</button>
                                </div>
                                <div className="space-y-2">
                                    {lorebooks.map(lb => (
                                        <label key={lb.id || lb.name} className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedLorebooks.includes(lb.name)}
                                                onChange={() => toggleLorebook(lb.name)}
                                                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span>{lb.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Persona Edit Modal */}
            {
                showPersonaEdit && (
                    <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6">
                            <h2 className="text-xl font-bold mb-4">{showPersonaEdit === 'new' ? 'New Persona' : 'Edit Persona'}</h2>
                            <form onSubmit={savePersona} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Name</label>
                                    <input name="name" defaultValue={typeof showPersonaEdit !== 'string' ? showPersonaEdit.name : ''} className="w-full bg-gray-700 rounded p-2 text-white" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Description</label>
                                    <textarea name="description" defaultValue={typeof showPersonaEdit !== 'string' ? showPersonaEdit.description : ''} rows={3} className="w-full bg-gray-700 rounded p-2 text-white" />
                                </div>
                                <div>
                                    <input name="avatarPath" defaultValue={typeof showPersonaEdit !== 'string' ? showPersonaEdit.avatarPath : ''} className="w-full bg-gray-700 rounded p-2 text-white" placeholder="/personas/my-avatar.png" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Linked Character (for memories)</label>
                                    <select name="characterId" defaultValue={typeof showPersonaEdit !== 'string' ? showPersonaEdit.characterId || '' : ''} className="w-full bg-gray-700 rounded p-2 text-white">
                                        <option value="">None</option>
                                        {allCharacters.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex justify-end space-x-2">
                                    <button type="button" onClick={() => setShowPersonaEdit(null)} className="text-gray-400 hover:text-white px-4 py-2">Cancel</button>
                                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Save</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Lorebook Manage Modal */}
            {
                showLorebookManage && (
                    <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-800 rounded-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold">Manage Memory Books</h2>
                                <button onClick={() => setShowLorebookManage(false)} className="text-gray-400 hover:text-white">Close</button>
                            </div>

                            {!editingLorebook ? (
                                <div>
                                    <button onClick={() => setEditingLorebook('new')} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg mb-4">Create New Book</button>
                                    <div className="space-y-2">
                                        {lorebooks.map(lb => (
                                            <div key={lb.id || lb.name} className="flex justify-between items-center p-3 bg-gray-700 rounded">
                                                <div>
                                                    <div className="font-bold">{lb.name}</div>
                                                    <div className="text-xs text-gray-400 truncate max-w-xs">{lb.description}</div>
                                                </div>
                                                <button onClick={() => loadLorebookDetails(lb.id!)} className="text-blue-400 hover:text-blue-300">Edit</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold">{typeof editingLorebook === 'string' ? 'New Book' : editingLorebook.name}</h3>
                                        <button onClick={() => setEditingLorebook(null)} className="text-gray-400 hover:text-white">Back to List</button>
                                    </div>

                                    <form onSubmit={saveLorebook} className="space-y-4 mb-6 border-b border-gray-700 pb-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400">Name</label>
                                                <input name="name" defaultValue={typeof editingLorebook !== 'string' ? editingLorebook.name : ''} className="w-full bg-gray-700 rounded p-2 text-white" required />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400">Description</label>
                                                <input name="description" defaultValue={typeof editingLorebook !== 'string' ? editingLorebook.description : ''} className="w-full bg-gray-700 rounded p-2 text-white" />
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Save Details</button>
                                        </div>
                                    </form>

                                    {typeof editingLorebook !== 'string' && (
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="font-semibold text-gray-400">Entries</h4>
                                                <button onClick={() => setEditingEntry('new')} className="text-xs text-blue-400 hover:text-blue-300">+ Add Entry</button>
                                            </div>

                                            {!editingEntry ? (
                                                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                                    {editingLorebook.entries?.map(entry => (
                                                        <div key={entry.id} className="bg-gray-700 p-3 rounded flex justify-between items-start">
                                                            <div className="flex-1 mr-4">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`w-2 h-2 rounded-full ${entry.enabled ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                                    <span className="font-bold text-sm">{entry.label || 'No Label'}</span>
                                                                    <span className="text-xs bg-gray-600 px-1 rounded text-gray-300" title="Weight">W: {entry.weight || 5}</span>
                                                                </div>
                                                                <div className="text-xs text-gray-300 line-clamp-2 mb-1">{entry.content}</div>
                                                                <div className="text-xs text-gray-500 font-mono mb-1">
                                                                    {JSON.parse(entry.keywords || '[]').join(', ')}
                                                                </div>
                                                                <div className="text-[10px] text-gray-500">
                                                                    {(entry as any).createdAt ? new Date((entry as any).createdAt).toLocaleString() : 'Unknown Date'}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-2">
                                                                <button onClick={() => setEditingEntry(entry)} className="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
                                                                <button onClick={() => deleteEntry(entry.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(!editingLorebook.entries || editingLorebook.entries.length === 0) && (
                                                        <p className="text-gray-500 text-center py-4">No entries yet.</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="bg-gray-700 p-4 rounded">
                                                    <h4 className="font-bold mb-4">{editingEntry === 'new' ? 'New Entry' : 'Edit Entry'}</h4>
                                                    <form onSubmit={saveEntry} className="space-y-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-400">Title (Label)</label>
                                                            <input
                                                                name="label"
                                                                defaultValue={typeof editingEntry !== 'string' ? editingEntry.label || '' : ''}
                                                                className="w-full bg-gray-800 rounded p-2 text-white"
                                                                placeholder="e.g. The Great War, Magic System..."
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-400">Content</label>
                                                            <textarea name="content" defaultValue={typeof editingEntry !== 'string' ? editingEntry.content : ''} rows={4} className="w-full bg-gray-800 rounded p-2 text-white" required />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-400">Keywords (comma separated)</label>
                                                            <input
                                                                name="keywords"
                                                                defaultValue={typeof editingEntry !== 'string' ? JSON.parse(editingEntry.keywords || '[]').join(', ') : ''}
                                                                className="w-full bg-gray-800 rounded p-2 text-white"
                                                                placeholder="keyword1, keyword2, phrase three"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-400">Weight (1-10)</label>
                                                            <input
                                                                type="number"
                                                                name="weight"
                                                                min="1"
                                                                max="10"
                                                                defaultValue={typeof editingEntry !== 'string' ? editingEntry.weight || 5 : 5}
                                                                className="w-full bg-gray-800 rounded p-2 text-white"
                                                            />
                                                        </div>
                                                        <div className="flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                name="enabled"
                                                                defaultChecked={typeof editingEntry !== 'string' ? editingEntry.enabled : true}
                                                                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 mr-2"
                                                            />
                                                            <label className="text-sm text-gray-400">Enabled</label>
                                                        </div>
                                                        <div className="flex justify-end space-x-2">
                                                            <button type="button" onClick={() => setEditingEntry(null)} className="text-gray-400 hover:text-white px-4 py-2">Cancel</button>
                                                            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Save Entry</button>
                                                        </div>
                                                    </form>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                            }
                        </div >
                    </div >
                )
            }

            {/* Prompt Viewer Modal */}
            {
                viewingPrompt && (
                    <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-800 rounded-2xl w-full max-w-4xl p-6 h-[80vh] flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold">Prompt Log</h2>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            const content = JSON.parse(viewingPrompt).prompt || viewingPrompt;
                                            navigator.clipboard.writeText(content);
                                        }}
                                        className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-white"
                                    >
                                        Copy
                                    </button>
                                    <button onClick={() => setViewingPrompt(null)} className="text-gray-400 hover:text-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {(() => {
                                let content = viewingPrompt;
                                let stats = null;
                                try {
                                    const parsed = JSON.parse(viewingPrompt);
                                    if (parsed.breakdown) {
                                        content = parsed.prompt;
                                        stats = parsed;
                                    }
                                } catch (e) {
                                    // Not JSON, legacy format
                                }

                                return (
                                    <>
                                        {stats && (
                                            <div className="mb-4 bg-gray-900 p-4 rounded-lg space-y-3">
                                                <div className="flex justify-between text-sm text-gray-400 mb-1">
                                                    <span>Context Usage</span>
                                                    <span>{Math.round(stats.breakdown.total / 4)} / {stats.contextLimit} tokens ({stats.breakdown.total} chars)</span>
                                                </div>
                                                <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden flex">
                                                    <div style={{ width: `${(stats.breakdown.system / 4 / stats.contextLimit) * 100}%` }} className="bg-red-500 h-full" title={`System: ${Math.round(stats.breakdown.system / 4)} tokens`} />
                                                    <div style={{ width: `${(stats.breakdown.lorebook / 4 / stats.contextLimit) * 100}%` }} className="bg-green-500 h-full" title={`Lorebook: ${Math.round(stats.breakdown.lorebook / 4)} tokens`} />
                                                    <div style={{ width: `${(stats.breakdown.memories / 4 / stats.contextLimit) * 100}%` }} className="bg-yellow-500 h-full" title={`Memories: ${Math.round(stats.breakdown.memories / 4)} tokens`} />
                                                    <div style={{ width: `${(stats.breakdown.summary / 4 / stats.contextLimit) * 100}%` }} className="bg-purple-500 h-full" title={`Summary: ${Math.round(stats.breakdown.summary / 4)} tokens`} />
                                                    <div style={{ width: `${(stats.breakdown.history / 4 / stats.contextLimit) * 100}%` }} className="bg-blue-500 h-full" title={`History: ${Math.round(stats.breakdown.history / 4)} tokens`} />
                                                </div>
                                                <div className="flex flex-wrap gap-4 text-xs">
                                                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> System: {Math.round(stats.breakdown.system / 4)}</div>
                                                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /> Lorebook: {Math.round(stats.breakdown.lorebook / 4)}</div>
                                                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500" /> Memories: {Math.round(stats.breakdown.memories / 4)}</div>
                                                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500" /> Summary: {Math.round(stats.breakdown.summary / 4)}</div>
                                                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> History: {Math.round(stats.breakdown.history / 4)}</div>
                                                </div>
                                            </div>
                                        )}
                                        <pre className="flex-1 overflow-auto bg-gray-900 p-4 rounded text-xs md:text-sm font-mono whitespace-pre-wrap text-gray-300">
                                            {content}
                                        </pre>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )
            }

            {/* Chat Area */}
            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => {
                    // Find persona for avatar
                    let avatarPath = null;
                    if (msg.role === 'user') {
                        // Try to find persona by name stored in message
                        if (msg.name) {
                            const p = personas.find(p => p.name === msg.name);
                            if (p) avatarPath = p.avatarPath;
                        }
                        // Fallback to current selected persona if no name stored (legacy) or name matches
                        if (!avatarPath && selectedPersonaId) {
                            const p = personas.find(p => p.id === selectedPersonaId);
                            if (p && (!msg.name || p.name === msg.name)) avatarPath = p.avatarPath;
                        }
                    }

                    return (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                            {/* Assistant Avatar (Left) */}
                            {msg.role === 'assistant' && (
                                <div className="w-8 h-8 rounded-full overflow-hidden relative flex-shrink-0 bg-gray-700">
                                    <Image src={character.avatarPath || '/placeholder.png'} alt={character.name} fill className="object-cover" unoptimized />
                                </div>
                            )}

                            <div
                                className={`max-w-[80%] p-3 rounded-2xl relative group ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : 'bg-gray-700 text-gray-100 rounded-bl-none'
                                    }`}
                            >
                                <div className="whitespace-pre-wrap">{formatMessage(msg.content)}</div>

                                {/* Log Button */}
                                {msg.promptUsed && (
                                    <button
                                        onClick={() => setViewingPrompt(msg.promptUsed!)}
                                        className="text-[10px] text-white/50 hover:text-white mt-1 block text-right w-full"
                                    >
                                        View Prompt
                                    </button>
                                )}

                                {/* Swipe & Regenerate Controls */}
                                {msg.role === 'assistant' && msg.id && (
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-600/50">
                                        <div className="flex items-center gap-1">
                                            {msg.swipes && JSON.parse(msg.swipes).length > 1 && idx === messages.length - 1 && (
                                                <>
                                                    <button onClick={() => handleSwipe(msg.id!, 'left')} className="p-1 hover:text-white text-gray-400">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                    <span className="text-[10px] text-gray-400">
                                                        {(msg.currentIndex || 0) + 1}/{JSON.parse(msg.swipes).length}
                                                    </span>
                                                    <button onClick={() => handleSwipe(msg.id!, 'right')} className="p-1 hover:text-white text-gray-400">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        {idx === messages.length - 1 && (
                                            <button onClick={() => handleRegenerate(msg.id!)} className="p-1 hover:text-white text-gray-400" title="Regenerate">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                )}
                                <button
                                    onClick={() => deleteMessage((msg as any).id)}
                                    className="absolute top-1 right-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 text-gray-400 hover:text-red-400 p-1"
                                    title="Delete from here"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                </button>
                            </div>

                            {/* User Avatar (Right) */}
                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full overflow-hidden relative flex-shrink-0 bg-gray-700">
                                    {avatarPath ? (
                                        <Image src={avatarPath} alt="User" fill className="object-cover" unoptimized />
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-xs text-gray-400">
                                            {msg.name ? msg.name[0] : 'U'}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-700 text-gray-100 rounded-2xl rounded-bl-none px-4 py-2">
                            <span className="animate-pulse">...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-gray-800 border-t border-gray-700">
                <div className="flex items-end gap-2 bg-gray-900 rounded-2xl p-2 border border-gray-700 focus-within:border-blue-500 transition-colors">
                    <button
                        onClick={handleImpersonate}
                        disabled={isLoading}
                        className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors mb-1 flex-shrink-0"
                        title="Impersonate (Generate User Message)"
                    >
                        <div className="w-6 h-6 rounded-full overflow-hidden relative bg-gray-600">
                            {currentPersona?.avatarPath ? (
                                <Image src={currentPersona.avatarPath} alt="Persona" fill className="object-cover" unoptimized />
                            ) : (
                                <div className="flex items-center justify-center h-full text-[10px]">{currentPersona?.name?.[0] || 'U'}</div>
                            )}
                        </div>
                    </button>
                    <textarea
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder="Type a message..."
                        className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none max-h-48 py-2 px-2"
                        rows={3}
                        style={{ minHeight: '88px' }}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={isLoading || !input.trim()}
                        className="p-2 bg-blue-600 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors mb-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div >
    );
}
