'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { VoiceBankModal } from '@/components/VoiceBankModal';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useSettingsStore } from '@/lib/store/settings-store';
import { Logger } from '@/lib/logger';
import { stripImageCommands } from '@/lib/text-utils';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    promptUsed?: string;
    name?: string;
    id?: number;
    swipes?: string; // JSON string
    currentIndex?: number;
    audioPaths?: string; // JSON string array of paths
}

interface CharacterDetails {
    id: number;
    name: string;
    avatarPath: string;
    description?: string;
    appearance?: string;
    firstMessage?: string;
    scenario?: string;
    systemPrompt?: string;
    personality?: string;
    lorebooks?: string; // JSON string
    voiceSample?: string;
    voiceSampleText?: string;
    voiceSpeed?: number;
    voiceId?: number;
    voice?: { id: number, name: string, filePath: string }; // If joined
}

interface ChatSession {
    id: number;
    name: string;
    updatedAt: string;
    personaId?: number;
    responseStyle?: 'short' | 'long';
    shortTemperature?: number;
    longTemperature?: number;
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
    isAlwaysIncluded?: boolean;
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

    // LLM Settings
    const { temperature, top_p, top_k, min_p, num_predict, trimLength, defaultShortTemperature, defaultLongTemperature, performanceLogging, updateSettings } = useSettingsStore();

    // Settings State
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
    const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
    const [selectedLorebooks, setSelectedLorebooks] = useState<string[]>([]); // Using names
    const [responseStyle, setResponseStyle] = useState<'short' | 'long'>('long');
    const [shortTemp, setShortTemp] = useState<number | undefined>(undefined);
    const [longTemp, setLongTemp] = useState<number | undefined>(undefined);
    const [showSettings, setShowSettings] = useState(false);

    // Edit Modals State
    const [showCharEdit, setShowCharEdit] = useState(false);
    const [editAvatarPath, setEditAvatarPath] = useState<string | null>(null);
    const [editAppearance, setEditAppearance] = useState('');
    const [editPersonality, setEditPersonality] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editScenario, setEditScenario] = useState('');
    const [editFirstMessage, setEditFirstMessage] = useState('');
    const [showPersonaEdit, setShowPersonaEdit] = useState<Persona | 'new' | null>(null);
    const [showLorebookManage, setShowLorebookManage] = useState(false);
    const [editingLorebook, setEditingLorebook] = useState<Lorebook | 'new' | null>(null);
    const [editingEntry, setEditingEntry] = useState<LorebookEntry | 'new' | null>(null);

    // Character Delete State
    const [showDeleteCharConfirm, setShowDeleteCharConfirm] = useState(false);
    const [deleteCharWithLorebook, setDeleteCharWithLorebook] = useState(false);

    // Prompt Inspection State
    const [viewingPrompt, setViewingPrompt] = useState<string | null>(null);
    const [charEditTab, setCharEditTab] = useState<'details' | 'memories' | 'videos' | 'voice'>('details');

    // Copy State
    const [copiedId, setCopiedId] = useState<number | null>(null);

    // Audio State
    const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
    const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
    const [audioGeneratingId, setAudioGeneratingId] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const emojiButtonRef = useRef<HTMLButtonElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const touchStartRef = useRef<number | null>(null);
    const touchEndRef = useRef<number | null>(null);

    // Trait Generation State
    const [generatingTrait, setGeneratingTrait] = useState<string | null>(null);

    const GenerateButton = ({ trait }: { trait: string }) => (
        <button
            type="button"
            onClick={() => handleGenerateTrait(trait)}
            disabled={!!generatingTrait}
            className={`p-1 rounded transition-colors ${generatingTrait === trait ? 'text-gray-500 cursor-not-allowed' : 'text-purple-400 hover:text-purple-300 hover:bg-purple-900/20'}`}
            title="Generate from Memories"
        >
            {generatingTrait === trait ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
            )}
        </button>
    );

    const handleGenerateTrait = async (trait: string) => {
        if (!character) return;
        setGeneratingTrait(trait);
        try {
            const res = await fetch('/api/characters/generate-trait', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId: character.id,
                    trait,
                    currentAttributes: {
                        appearance: editAppearance,
                        personality: editPersonality,
                        description: character.description,
                        scenario: character.scenario
                    }
                })
            });
            const data = await res.json();
            if (data.result) {
                if (trait === 'appearance') setEditAppearance(data.result);
                if (trait === 'personality') setEditPersonality(data.result);
                if (trait === 'description') setEditDescription(data.result);
                if (trait === 'scenario') setEditScenario(data.result);
                if (trait === 'firstMessage') setEditFirstMessage(data.result);
            } else if (data.error) {
                alert('Generation failed: ' + data.error);
            }
        } catch (e) {
            Logger.error('Trait generation error', e);
            alert('Error generating trait');
        } finally {
            setGeneratingTrait(null);
        }
    };

    const deleteLorebook = async (id: number) => {
        if (!confirm('Are you sure you want to delete this lorebook? All entries will also be deleted.')) return;
        try {
            const res = await fetch(`/api/lorebooks/${id}`, { method: 'DELETE' });
            if (res.ok) {
                // If currently editing this one, clear it
                if (editingLorebook && typeof editingLorebook !== 'string' && editingLorebook.id === id) {
                    setEditingLorebook(null);
                }
                loadData();
            }
        } catch (e) {
            Logger.error('Failed to delete lorebook', e);
        }
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (showEmojiPicker &&
                emojiPickerRef.current &&
                !emojiPickerRef.current.contains(event.target as Node) &&
                emojiButtonRef.current &&
                !emojiButtonRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showEmojiPicker]);

    const onEmojiClick = (emojiData: EmojiClickData) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setInput(prev => prev + emojiData.emoji);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = input;
        const before = text.substring(0, start);
        const after = text.substring(end);

        const newText = before + emojiData.emoji + after;
        setInput(newText);

        // Restore focus and update cursor position
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + emojiData.emoji.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };

    const handleCopy = (content: string, id: number) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // --- Memory Editor Component ---
    function MemoryEditor({ characterId }: { characterId: number }) {
        const [memories, setMemories] = useState<any[]>([]);
        const [loading, setLoading] = useState(true);
        const [isCreating, setIsCreating] = useState(false);
        const [newContent, setNewContent] = useState('');

        // Pagination & Search
        const [page, setPage] = useState(0);
        const [total, setTotal] = useState(0);
        const [searchQuery, setSearchQuery] = useState('');
        const [debouncedQuery, setDebouncedQuery] = useState('');
        const limit = 10;

        // Debounce Search
        useEffect(() => {
            const handler = setTimeout(() => {
                setDebouncedQuery(searchQuery);
            }, 500);
            return () => clearTimeout(handler);
        }, [searchQuery]);

        // Reset page on search change
        useEffect(() => {
            setPage(0);
        }, [debouncedQuery]);

        useEffect(() => {
            fetchMemories();
        }, [characterId, page, debouncedQuery]);

        const fetchMemories = async () => {
            setLoading(true);
            try {
                const queryParams = new URLSearchParams({
                    characterId: characterId.toString(),
                    limit: limit.toString(),
                    offset: (page * limit).toString(),
                    search: debouncedQuery
                });
                const res = await fetch(`/api/memories?${queryParams}`);
                if (res.ok) {
                    const data = await res.json();
                    // Handle both new format { memories, total } and legacy array just in case
                    if (Array.isArray(data)) {
                        setMemories(data);
                        setTotal(data.length);
                    } else {
                        setMemories(data.memories || []);
                        setTotal(data.total || 0);
                    }
                }
            } catch (e) {
                Logger.error('Fetch memories error:', e);
            } finally {
                setLoading(false);
            }
        };

        const createMemory = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!newContent) return;
            setIsCreating(true);
            try {
                const res = await fetch('/api/memories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        characterId,
                        content: newContent
                    })
                });
                if (res.ok) {
                    setNewContent('');

                    fetchMemories();
                }
            } catch (e) {
                Logger.error('Create memory error:', e);
            } finally {
                setIsCreating(false);
            }
        };

        const deleteMemory = async (id: string | number) => {
            if (!confirm('Delete this memory?')) return;
            try {
                const res = await fetch(`/api/memories/${id}?characterId=${characterId}`, { method: 'DELETE' });
                if (res.ok) fetchMemories();
            } catch (e) {
                Logger.error('Delete memory error:', e);
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

                        <button
                            type="submit"
                            disabled={isCreating}
                            className={`bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm flex items-center gap-2 ${isCreating ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isCreating ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Adding...
                                </>
                            ) : 'Add Memory'}
                        </button>
                    </form>
                </div>

                {/* Search Bar */}
                <div className="bg-gray-700 p-2 rounded flex gap-2">
                    <input
                        placeholder="Search / Filter memories..."
                        className="w-full bg-gray-800 rounded p-2 text-white text-sm"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="bg-gray-600 hover:bg-gray-500 text-white px-3 rounded text-sm"
                        >
                            Clear
                        </button>
                    )}
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {loading ? <p className="text-gray-400">Loading...</p> : memories.map(mem => (
                        <div key={mem.id} className="bg-gray-700 p-3 rounded flex justify-between items-start group">
                            <div>
                                <div className="text-sm text-white mb-1">{mem.content}</div>

                                <div className="text-[10px] text-gray-500">
                                    {new Date(mem.createdAt).toLocaleString()}
                                </div>
                            </div>
                            <button onClick={() => deleteMemory(mem.documentId || mem.id)} className="text-red-400 hover:text-red-300 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                            </button>
                        </div>
                    ))}
                    {!loading && memories.length === 0 && <p className="text-gray-500 text-center">No memories found.</p>}
                </div>

                {/* Pagination Controls */}
                {!loading && total > 0 && (
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-600">
                        <div>
                            Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}
                        </div>
                        <div className="flex gap-2">
                            <button
                                disabled={page === 0}
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                className={`px-3 py-1 rounded bg-gray-600 text-white ${page === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-500'}`}
                            >
                                Prev
                            </button>
                            <button
                                disabled={(page + 1) * limit >= total}
                                onClick={() => setPage(p => p + 1)}
                                className={`px-3 py-1 rounded bg-gray-600 text-white ${(page + 1) * limit >= total ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-500'}`}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
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
                Logger.error('Fetch videos error:', e);
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
                        Logger.error('Polling error', e);
                    }
                }, 5000); // Poll every 5 seconds

            } catch (e: any) {
                Logger.error('Video generation error:', e);
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
                Logger.error('Delete video error:', e);
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
                Logger.error('Set default video error:', e);
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

    // --- Voice Manager Component ---
    function VoiceManager({ characterId, currentVoice, currentText, currentSpeed, currentVoiceName }: { characterId: number, currentVoice?: string, currentText?: string, currentSpeed?: number, currentVoiceName?: string }) {
        const [uploading, setUploading] = useState(false);
        const [showVoiceBank, setShowVoiceBank] = useState(false);
        const [speed, setSpeed] = useState(currentSpeed || 1.0);

        const handleSaveSpeed = async () => {
            try {
                await fetch(`/api/characters/${characterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voiceSpeed: speed })
                });
                loadData();
                alert('Voice speed saved!');
            } catch (e) {
                Logger.error('Failed to save speed:', e);
                alert('Failed to save speed');
            }
        };

        const handleSelectVoice = async (voiceId: number) => {
            try {
                await fetch(`/api/characters/${characterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voiceId })
                });
                loadData();
            } catch (e) {
                Logger.error('Failed to assign voice:', e);
                alert('Failed to assign voice');
            }
        };

        const handleUnassign = async () => {
            if (!confirm('Unassign voice?')) return;
            try {
                await fetch(`/api/characters/${characterId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voiceId: null })
                });
                loadData();
            } catch (e) {
                Logger.error('Failed to unassign voice:', e);
                alert('Failed to unassign voice');
            }
        };

        return (
            <div className="space-y-4">
                <div className="bg-gray-700 p-4 rounded">
                    <h4 className="font-bold mb-4">Voice Settings</h4>

                    {currentVoice ? (
                        <div className="mb-6 p-4 bg-gray-800 rounded">
                            <h5 className="text-sm text-gray-400 mb-2">Assigned Voice</h5>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-white font-medium">{currentVoiceName || 'Unknown Voice'}</span>
                                <button onClick={handleUnassign} className="text-xs text-red-400 hover:text-red-300">Unassign</button>
                            </div>
                            <audio controls src={`/voices/${currentVoice.split('/').pop()}`} className="w-full mb-2" />
                            {/* We detect path logic here: if it's full path or relative. 
                                The API returns logic already does fallback, but for audio src here we derived.
                                Ideally API should return a web-accessible URL.
                                Let's assume currentVoice is the API-derived path or we construct: 
                                If it's linked voice, it's just filename.
                            */}
                        </div>
                    ) : (
                        <div className="mb-6 p-4 bg-gray-800 rounded text-center text-gray-500 text-sm">
                            No voice assigned. Use the Voice Bank to select one.
                        </div>
                    )}

                    <div className="mb-6 p-4 bg-gray-800 rounded">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Voice Speed: {speed.toFixed(1)}x</label>
                        <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={speed}
                            onChange={e => setSpeed(parseFloat(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0.5x (Slower)</span>
                            <span>1.0x (Normal)</span>
                            <span>2.0x (Faster)</span>
                        </div>
                        <button onClick={handleSaveSpeed} className="mt-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs">
                            Save Speed
                        </button>
                    </div>

                    <button
                        onClick={() => setShowVoiceBank(true)}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded w-full"
                    >
                        Open Voice Bank
                    </button>
                </div>

                <VoiceBankModal
                    isOpen={showVoiceBank}
                    onClose={() => setShowVoiceBank(false)}
                    onSelect={handleSelectVoice}
                />

                {currentVoice && (
                    <div className="bg-gray-700 p-4 rounded">
                        <h4 className="font-bold mb-4">Test Voice</h4>
                        <div className="space-y-4">
                            <input
                                id="test-voice-input"
                                className="w-full bg-gray-800 rounded p-2 text-white text-sm"
                                placeholder="Type something to speak..."
                                defaultValue="Hello, I am ready to chat."
                            />
                            <button
                                onClick={async (e) => {
                                    const btn = e.currentTarget;
                                    const input = document.getElementById('test-voice-input') as HTMLInputElement;
                                    const text = input.value;
                                    if (!text) return;

                                    btn.disabled = true;
                                    btn.textContent = 'Generating...';

                                    try {
                                        const res = await fetch('/api/tts', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ text, characterId })
                                        });
                                        if (res.ok) {
                                            const blob = await res.blob();
                                            const url = URL.createObjectURL(blob);
                                            const audio = new Audio(url);
                                            audio.play();
                                        } else {
                                            alert('TTS Generation failed');
                                        }
                                    } catch (err) {
                                        Logger.error('Error generating TTS:', err);
                                        alert('Error generating TTS');
                                    } finally {
                                        btn.disabled = false;
                                        btn.textContent = 'Test Voice';
                                    }
                                }}
                                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded w-full"
                            >
                                Test Voice
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }



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
            Logger.error('Failed to load data:', err);
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
                        Logger.error('Error parsing session lorebooks', e);
                    }
                } else if (character?.lorebooks) {
                    try {
                        setSelectedLorebooks(JSON.parse(character.lorebooks));
                    } catch (e) {
                        Logger.error('Error parsing character default lorebooks', e);
                    }
                } else {
                    setSelectedLorebooks([]);
                }
                if (data.session.responseStyle) {
                    setResponseStyle(data.session.responseStyle as 'short' | 'long');
                } else {
                    setResponseStyle('long');
                }
                setShortTemp(data.session.shortTemperature);
                setLongTemp(data.session.longTemperature);
            }
        } catch (e) {
            Logger.error('Failed to load session', e);
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
            Logger.error('Failed to create session', e);
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
                Logger.error('Failed to save session lorebooks', e);
            }
        }
    };

    const handleResponseStyleChange = async (style: 'short' | 'long') => {
        setResponseStyle(style);
        if (currentSessionId) {
            try {
                await fetch(`/api/chats/${currentSessionId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ responseStyle: style })
                });
            } catch (e) {
                Logger.error('Failed to save response style', e);
            }
        }
    };

    const saveTempOverrides = async () => {
        if (currentSessionId) {
            try {
                await fetch(`/api/chats/${currentSessionId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        shortTemperature: shortTemp,
                        longTemperature: longTemp
                    })
                });
                // Optional: visual feedback
            } catch (e) {
                Logger.error('Failed to save temp overrides', e);
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
            Logger.error('Failed to rename session', e);
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
            Logger.error('Failed to delete session', e);
        }
    };



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
            Logger.error('Failed to update character', e);
        }
    };

    const requestDeleteCharacter = () => {
        setShowDeleteCharConfirm(true);
        setDeleteCharWithLorebook(false);
    };

    const confirmDeleteCharacter = async () => {
        if (!character) return;

        try {
            const res = await fetch(`/api/characters/${character.id}?deleteLorebook=${deleteCharWithLorebook}`, { method: 'DELETE' });
            if (res.ok) {
                router.push('/');
            } else {
                alert('Failed to delete character');
            }
        } catch (e) {
            Logger.error('Failed to delete character', e);
            alert('Error deleting character');
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
            Logger.error('Failed to save persona', e);
        }
    };

    const deletePersona = async (id: number) => {
        if (!confirm('Are you sure you want to delete this persona?')) return;
        try {
            const res = await fetch(`/api/personas/${id}`, { method: 'DELETE' });
            if (res.ok) {
                loadData();
                setShowPersonaEdit(null);
                if (selectedPersonaId === id) {
                    setSelectedPersonaId(null);
                }
            }
        } catch (e) {
            Logger.error('Failed to delete persona', e);
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
            Logger.error('Failed to load lorebook details', e);
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
            Logger.error('Failed to save lorebook', e);
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
            enabled: formData.get('enabled') === 'on',
            isAlwaysIncluded: formData.get('isAlwaysIncluded') === 'on'
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
            Logger.error('Failed to save entry', e);
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
            Logger.error('Failed to delete entry', e);
        }
    };



    // Scroll to bottom only when new messages are added
    const prevMessagesLength = useRef(messages.length);
    useEffect(() => {
        if (messages.length > prevMessagesLength.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        prevMessagesLength.current = messages.length;
    }, [messages]);



    const handleRegenerate = async (messageId: number) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const effectiveTemp = responseStyle === 'short'
                ? (defaultShortTemperature !== undefined ? defaultShortTemperature : temperature)
                : (defaultLongTemperature !== undefined ? defaultLongTemperature : temperature);

            const res = await fetch('/api/chat/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId,
                    lorebooks: selectedLorebooks,
                    personaId: selectedPersonaId,
                    options: { temperature: effectiveTemp, top_p, top_k, min_p, num_predict },
                    trimLength,
                    performanceLogging
                })
            });
            if (res.ok) {
                const updatedMsg = await res.json();
                setMessages(prev => prev.map(m => (m.id === messageId ? updatedMsg : m)));
            }
        } catch (e) {
            Logger.error('Failed to regenerate', e);
        } finally {
            setIsLoading(false);
        }
    };

    // Swipe Handlers
    const onTouchStart = (e: React.TouchEvent) => {
        touchEndRef.current = null;
        touchStartRef.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e: React.TouchEvent) => {
        touchEndRef.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = (messageId: number) => {
        if (!touchStartRef.current || !touchEndRef.current) return;

        const distance = touchStartRef.current - touchEndRef.current;
        const isLeftSwipe = distance > 50;
        const isRightSwipe = distance < -50;

        if (isLeftSwipe) {
            // Swiped left (finger moved right to left) -> Go Next -> 'right' direction in backend logic?
            // Existing logic:
            // <button onClick={() => handleSwipe(msg.id!, 'right')} ...> (Right Arrow Icon) -> Next
            // <button onClick={() => handleSwipe(msg.id!, 'left')} ...> (Left Arrow Icon) -> Prev
            // Usually Swipe Left (content moves left) reveals right content -> Next
            handleSwipe(messageId, 'right');
        } else if (isRightSwipe) {
            // Swiped right -> Go Prev -> 'left' direction
            handleSwipe(messageId, 'left');
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
            Logger.error('Failed to swipe', e);
        }
    };

    const deleteMessage = async (id: number) => {
        const msg = messages.find((m: any) => m.id === id);
        // Check if we should delete just a swipe or the whole message
        const isSwipeDelete = msg && msg.role === 'assistant' && msg.swipes && JSON.parse(msg.swipes).length > 1;

        if (isSwipeDelete) {
            if (!confirm('Delete this response variant?')) return;
            try {
                const res = await fetch(`/api/messages/${id}/swipe`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ index: msg.currentIndex || 0 })
                });

                if (res.ok) {
                    const result = await res.json();
                    if (result.deletedMessage) {
                        // Should not happen if we checked length > 1, but safe fallback
                        setMessages(prev => prev.filter((m: any) => m.id !== id));
                    } else {
                        // Update message with new content/index
                        setMessages(prev => prev.map((m: any) => m.id === id ? result.message : m));
                    }
                }
            } catch (e) {
                Logger.error('Failed to delete swipe', e);
            }
            return;
        }

        // Standard delete (full message)
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
            Logger.error('Failed to delete message', e);
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
            const effectiveTemp = responseStyle === 'short'
                ? (defaultShortTemperature !== undefined ? defaultShortTemperature : temperature)
                : (defaultLongTemperature !== undefined ? defaultLongTemperature : temperature);

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    content: userMessage.content,
                    model: null, // Let server decide or use default
                    personaId: selectedPersonaId,
                    lorebooks: selectedLorebooks,
                    options: {
                        temperature: effectiveTemp,
                        top_p,
                        top_k,
                        min_p,
                        num_predict
                    },
                    trimLength,
                    performanceLogging
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
            Logger.error('Error sending message:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get response.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const playTTS = async (text: string, messageId?: number, swipeIndex: number = 0, regenerate: boolean = false) => {
        if (!character) return;
        if (messageId && audioGeneratingId === messageId) return; // Prevent double trigger

        // Toggle Play/Pause if clicking same message and not regenerating
        if (messageId && messageId === playingMessageId && currentAudio && !regenerate) {
            if (isPlaying) {
                currentAudio.pause();
            } else {
                currentAudio.play();
            }
            return;
        }

        // Stop existing audio
        if (currentAudio) {
            currentAudio.pause();
            setCurrentAudio(null);
            setIsPlaying(false);
            setPlayingMessageId(null);
        }

        if (messageId) setAudioGeneratingId(messageId);

        try {
            Logger.debug(`[playTTS] Generating/Playing for message ${messageId}. Original length: ${text.length}`);
            const cleanText = stripImageCommands(text);
            Logger.debug(`[playTTS] Stripped text for TTS: "${cleanText.substring(0, 50)}..."`);

            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanText, characterId: character.id, messageId, swipeIndex, regenerate })
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);

                audio.onplay = () => {
                    setIsPlaying(true);
                    if (messageId) setPlayingMessageId(messageId);
                };
                audio.onpause = () => setIsPlaying(false);
                audio.onended = () => {
                    setIsPlaying(false);
                    setPlayingMessageId(null);
                };

                setCurrentAudio(audio);
                audio.play();

                // Update local state to show "Play" icon immediately (if generating for first time)
                if (messageId) {
                    setMessages(prev => prev.map(m => {
                        if (m.id === messageId) {
                            let paths: string[] = [];
                            try {
                                paths = m.audioPaths ? JSON.parse(m.audioPaths) : [];
                            } catch (e) { }
                            // Placeholder update as before
                            paths[swipeIndex] = paths[swipeIndex] || 'temp-generated';
                            return { ...m, audioPaths: JSON.stringify(paths) };
                        }
                        return m;
                    }));
                }
            } else {
                Logger.error('TTS failed');
            }
        } catch (e) {
            Logger.error('TTS error:', e);
        } finally {
            if (messageId) setAudioGeneratingId(null);
        }
    };



    const handleImpersonate = async () => {
        if (isLoading || !currentSessionId) return;
        setIsLoading(true);
        try {
            const effectiveTemp = responseStyle === 'short'
                ? (defaultShortTemperature !== undefined ? defaultShortTemperature : temperature)
                : (defaultLongTemperature !== undefined ? defaultLongTemperature : temperature);

            const res = await fetch('/api/chat/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    personaId: selectedPersonaId,
                    options: { temperature: effectiveTemp, top_p, top_k, min_p, num_predict },
                    trimLength,
                    performanceLogging
                })
            });
            if (res.ok) {
                const data = await res.json();
                setInput(data.content);
            }
        } catch (e) {
            Logger.error('Failed to impersonate', e);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Image Generation Logic ---
    const processingImages = useRef<Set<number>>(new Set());

    useEffect(() => {
        messages.forEach(msg => {
            if (msg.role === 'assistant' && msg.id && !processingImages.current.has(msg.id)) {
                // Check for [GENERATE_IMAGE: ...] tag
                const match = msg.content.match(/\[GENERATE_IMAGE:\s*(.+?)\]/);
                if (match) {
                    const description = match[1];
                    // Trigger generation
                    processingImages.current.add(msg.id);
                    generateImageForMessage(msg.id, description, match[0]);
                }
            }
        });
    }, [messages]);

    const getEnhancedPrompt = (description: string) => {
        let finalPrompt = description;
        const enhancements: string[] = [];

        if (character && description.toLowerCase().includes(character.name.toLowerCase().split(' ')[0])) {
            // Default Character Logic (only if name mentioned)
            enhancements.push('(' + character.name + ' is a ' + character.appearance + ')');
        }

        const currentPersona = personas.find(p => p.id === selectedPersonaId);

        if (currentPersona && description.toLowerCase().includes(currentPersona.name.toLowerCase().split(' ')[0])) {
            if (currentPersona.characterId) {
                // Use Linked Character
                const linkedCharacter = allCharacters.find(c => c.id === currentPersona.characterId);
                if (linkedCharacter) {
                    enhancements.push('(' + linkedCharacter.name + ' is a ' + linkedCharacter.appearance + ')');
                } else {
                    // Fallback if linked character not found? Or just use persona
                    enhancements.push('(' + currentPersona.name + ' is a ' + currentPersona.description + ')');
                }
            } else {
                // No Linked Character - Use Persona
                enhancements.push('(' + currentPersona.name + ' is a ' + currentPersona.description + ')');
            }
        }

        if (enhancements.length > 0) {
            finalPrompt = `${enhancements.join(', ')}, (${description})`;
        }
        return finalPrompt;
    };

    const generateImageForMessage = async (messageId: number, description: string, tag: string) => {
        try {
            Logger.info(`Triggering auto-image generation for message ${messageId}: ${description}`);

            // Enhance prompt
            const finalPrompt = getEnhancedPrompt(description);
            Logger.debug(`Enhanced prompt with character details: ${finalPrompt}`);

            // 1. Call Generate API
            const res = await fetch('/api/images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: finalPrompt, type: 'message' })
            });

            if (!res.ok) throw new Error('Failed to request generation');

            const { promptId } = await res.json();

            // 2. Poll for completion
            const poll = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/images/status?promptId=${promptId}`);
                    const statusData = await statusRes.json();

                    if (statusData.status === 'completed' && statusData.imagePath) {
                        clearInterval(poll);

                        // 3. Update Message Content
                        // Replace tag with markdown image syntax
                        // We need the latest state of the message to safely replace
                        const updateRes = await fetch(`/api/messages/${messageId}`, {
                            method: 'GET' // Or assume we have content. Better to fetch fresh or use state if consistent.
                        });
                        // Actually, let's just use a direct patch with replacement on the current message content we have in memory?
                        // No, concurrency. Best to fetch latest, replace, then patch.
                        // Ideally backend handles this, but we are doing client-side orchestration.

                        // Simple approach: Use the state's content for this ID
                        setMessages(prev => {
                            const msg = prev.find(m => m.id === messageId);
                            if (!msg) return prev;

                            const newContent = msg.content.replace(tag, `![${description}](${statusData.imagePath})`);

                            // Async update DB
                            fetch(`/api/messages/${messageId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ content: newContent })
                            }).catch(e => Logger.error('Failed to save image to message', e));

                            return prev.map(m => m.id === messageId ? { ...m, content: newContent } : m);
                        });

                        processingImages.current.delete(messageId);

                    } else if (statusData.status === 'failed') {
                        clearInterval(poll);
                        Logger.error('Image generation failed');
                        processingImages.current.delete(messageId);
                    }
                } catch (e) {
                    Logger.error('Polling error', e);
                    clearInterval(poll);
                    processingImages.current.delete(messageId);
                }
            }, 3000);

        } catch (e) {
            Logger.error('Image generation error', e);
            processingImages.current.delete(messageId);
        }
    };


    const triggerImageRegeneration = async (messageId: number, prompt: string, oldUrl: string) => {
        if (processingImages.current.has(messageId)) return;
        processingImages.current.add(messageId);

        // Force update UI to show spinner? 
        // We can use a temporary state or just rely on processingImages ref + forceUpdate or wait for poll
        // But processingImages is a Ref, doesn't trigger render.
        // Let's rely on the image placeholder replacement?
        // Actually, we want to replace the current image with a spinner or overlay.
        // But we can't easily modify the content string to a spinner tag easily without potentially messing up.
        // Strategy: Just start generation. The UI buttons can show "Generating..." based on state.
        // I'll add a state `generatingImages` Map<string, boolean> (key: msgId-imgUrl) to track specific image gen?
        // Or just use `processingImages` set (msgId).

        try {
            Logger.info(`Regenerating image for message ${messageId}`);
            const res = await fetch('/api/images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: prompt, type: 'message' })
            });

            if (!res.ok) throw new Error('Failed to request generation');
            const { promptId } = await res.json();

            // Poll
            const poll = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/images/status?promptId=${promptId}`);
                    const statusData = await statusRes.json();

                    if (statusData.status === 'completed' && statusData.imagePath) {
                        clearInterval(poll);

                        setMessages(prev => {
                            const m = prev.find(pm => pm.id === messageId);
                            if (!m) return prev;

                            // Replace the specific image URL in content
                            // We use the oldUrl to find and replace.
                            const newContent = m.content.replace(oldUrl, statusData.imagePath);

                            // Update DB
                            fetch(`/api/messages/${messageId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ content: newContent })
                            }).catch(e => Logger.error('Failed to save regenerated image', e));

                            return prev.map(pm => pm.id === messageId ? { ...pm, content: newContent } : pm);
                        });
                        processingImages.current.delete(messageId);
                    } else if (statusData.status === 'failed') {
                        clearInterval(poll);
                        processingImages.current.delete(messageId);
                        alert('Image generation failed.');
                    }
                } catch (e) {
                    clearInterval(poll);
                    processingImages.current.delete(messageId);
                }
            }, 3000);

        } catch (e) {
            Logger.error('Regeneration error', e);
            processingImages.current.delete(messageId);
        }
    };

    // Helper to format message content (italics for *text*, images, and generation tags)
    const formatMessage = (content: string, msg?: Message) => {
        // Replace variables
        let formatted = content;
        if (character) {
            formatted = formatted.replace(/{{char}}/gi, character.name);
        }

        const currentPersona = personas.find(p => p.id === selectedPersonaId);
        const userName = currentPersona?.name || 'User';
        formatted = formatted.replace(/{{user}}/gi, userName);

        // Split by Markdown Image: ![alt](url)
        // AND [GENERATE_IMAGE: ...] tag
        // AND Italics *...*

        // We use a combined regex to tokenise
        // Groups: 
        // 1. Image: !\[(.*?)\]\((.*?)\)
        // 2. Gen Tag: \[GENERATE_IMAGE:\s*(.+?)\]
        // 3. Italics: \*([^*]+)\*
        const regex = /(!\[.*?\]\(.*?\))|(\[GENERATE_IMAGE:\s*.+?\])|(\*[^*]+\*)/g;

        const parts = formatted.split(regex).filter(p => p !== undefined && p !== '');

        let nodes: React.ReactNode[] = [formatted];

        // 1. Handle Images
        const processImages = (nodeList: React.ReactNode[]) => {
            let imgCount = 0;
            return nodeList.flatMap(node => {
                if (typeof node !== 'string') return node;
                const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
                const parts = node.split(imgRegex);
                if (parts.length === 1) return node;

                const result: React.ReactNode[] = [];
                for (let i = 0; i < parts.length; i += 3) {
                    result.push(parts[i]);
                    if (i + 1 < parts.length) {
                        const alt = parts[i + 1];
                        const src = parts[i + 2];
                        const currentImgIndex = imgCount++;

                        let promptForThisImage = getEnhancedPrompt(alt);

                        const isGenerating = msg && msg.id && processingImages.current.has(msg.id); // Simple check, ideally check specific image

                        result.push(
                            <div key={`img-${i}`} className="my-2 relative group inline-block max-w-full">
                                <img src={src} alt={alt} className={`max-w-full h-auto rounded shadow-lg transition-opacity ${isGenerating ? 'opacity-50' : 'opacity-100'}`} />
                                {isGenerating && <div className="absolute inset-0 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div></div>}

                                <div className="absolute bottom-2 right-2 flex gap-2 transition-opacity bg-black/60 p-1 rounded backdrop-blur-sm opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                    <button
                                        onClick={() => setViewingPrompt(promptForThisImage)}
                                        className="text-xs text-white hover:text-blue-300 px-2 py-1"
                                        title="View Image Prompt"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => msg && msg.id && triggerImageRegeneration(msg.id, promptForThisImage, src)}
                                        className="text-xs text-white hover:text-green-300 px-2 py-1"
                                        title="Regenerate Image"
                                        disabled={!!isGenerating}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        );
                    }
                }
                return result;
            });
        };

        // 2. Handle Generation Tag
        const processGenTags = (nodeList: React.ReactNode[]) => {
            return nodeList.flatMap(node => {
                if (typeof node !== 'string') return node;
                const tagRegex = /(\[GENERATE_IMAGE:\s*.+?\])/g;
                const parts = node.split(tagRegex);
                return parts.map((part, i) => {
                    if (part.match(/^\[GENERATE_IMAGE:/)) {
                        return (
                            <div key={`gen-${i}`} className="my-2 p-3 bg-gray-800 rounded border border-purple-500/30 flex items-center space-x-3 isolate">
                                <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                                <span className="text-sm text-purple-300 animate-pulse">Painting a new picture...</span>
                            </div>
                        );
                    }
                    return part;
                });
            });
        };

        // 3. Handle Italics
        const processItalics = (nodeList: React.ReactNode[]) => {
            return nodeList.flatMap(node => {
                if (typeof node !== 'string') return node;
                const parts = node.split(/(\*[^*]+\*)/g);
                return parts.map((part, index) => {
                    if (part.startsWith('*') && part.endsWith('*')) {
                        return <em key={`em-${index}`} className="text-blue-200">{part.slice(1, -1)}</em>;
                    }
                    return part;
                });
            });
        };

        // Pipeline
        nodes = processImages(nodes);
        nodes = processGenTags(nodes);
        nodes = processItalics(nodes);

        return nodes;
    };

    const currentPersona = personas.find(p => p.id === selectedPersonaId);

    useEffect(() => {
        if (showCharEdit && character) {
            setEditAvatarPath(character.avatarPath);
            setEditAppearance(character.appearance || '');
            setEditPersonality(character.personality || '');
            setEditDescription(character.description || '');
            setEditScenario(character.scenario || '');
            setEditFirstMessage(character.firstMessage || '');
        }
    }, [showCharEdit, character]);

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
            {showCharEdit && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
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
                            <button type="button" onClick={() => setCharEditTab('voice')} className={`px-4 py-2 ${charEditTab === 'voice' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}>Voice</button>
                        </div>

                        {charEditTab === 'details' ? (
                            <form onSubmit={updateCharacter} className="space-y-4">
                                <AvatarPicker
                                    currentAvatar={editAvatarPath}
                                    onAvatarChange={setEditAvatarPath}
                                    generateContext={editAppearance + ' ' + editPersonality}
                                />
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Name <span className="text-red-500">*</span></label>
                                    <input name="name" required defaultValue={character.name} className="w-full bg-gray-700 rounded p-2 text-white" />
                                </div>

                                {/* Appearance */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">Appearance</label>
                                        <GenerateButton trait="appearance" />
                                    </div>
                                    <input
                                        name="appearance"
                                        value={editAppearance}
                                        onChange={(e) => setEditAppearance(e.target.value)}
                                        className="w-full bg-gray-700 rounded p-2 text-white"
                                        placeholder="e.g. Tall, blue eyes..."
                                    />
                                </div>

                                {/* Personality */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">Personality</label>
                                        <GenerateButton trait="personality" />
                                    </div>
                                    <textarea
                                        name="personality"
                                        value={editPersonality}
                                        onChange={(e) => setEditPersonality(e.target.value)}
                                        rows={2}
                                        className="w-full bg-gray-700 rounded p-2 text-white"
                                    />
                                </div>

                                {/* Background Story */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">Background Story</label>
                                        <GenerateButton trait="description" />
                                    </div>
                                    <textarea
                                        name="description"
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        rows={3}
                                        className="w-full bg-gray-700 rounded p-2 text-white"
                                    />
                                </div>

                                {/* Scenario */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">Scenario</label>
                                        <GenerateButton trait="scenario" />
                                    </div>
                                    <textarea
                                        name="scenario"
                                        value={editScenario}
                                        onChange={(e) => setEditScenario(e.target.value)}
                                        rows={3}
                                        className="w-full bg-gray-700 rounded p-2 text-white"
                                    />
                                </div>

                                {/* First Message */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">First Message</label>
                                        <GenerateButton trait="firstMessage" />
                                    </div>
                                    <textarea
                                        name="firstMessage"
                                        value={editFirstMessage}
                                        onChange={(e) => setEditFirstMessage(e.target.value)}
                                        rows={4}
                                        className="w-full bg-gray-700 rounded p-2 text-white font-mono text-sm"
                                    />
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

                                <div className="flex justify-between pt-4 items-center">
                                    <button
                                        type="button"
                                        onClick={requestDeleteCharacter}
                                        className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded"
                                    >
                                        Delete Character
                                    </button>
                                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Save Changes</button>
                                </div>
                            </form>
                        ) : charEditTab === 'memories' ? (
                            <MemoryEditor characterId={character.id} />
                        ) : charEditTab === 'videos' ? (
                            <VideoManager characterId={character.id} />
                        ) : (
                            <VoiceManager
                                characterId={character.id}
                                currentVoice={character.voice?.filePath || character.voiceSample}
                                currentText={character.voiceSampleText}
                                currentSpeed={character.voiceSpeed}
                                currentVoiceName={character.voice?.name || (character.voiceSample ? 'Legacy Voice' : undefined)}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Delete Character Confirmation Modal */}

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
                                <h3 className="font-semibold text-gray-400 text-sm uppercase tracking-wider mb-2">Response Style</h3>
                                <div className="flex bg-gray-700 rounded p-1 mb-6">
                                    <button
                                        onClick={() => handleResponseStyleChange('short')}
                                        className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${responseStyle === 'short' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Short
                                    </button>
                                    <button
                                        onClick={() => handleResponseStyleChange('long')}
                                        className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${responseStyle === 'long' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Long
                                    </button>
                                </div>

                                {/* Temp Overrides */}
                                <div className="mb-6 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 mb-1">Short Temp</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="Default"
                                            className="w-full bg-gray-700 rounded p-2 text-white text-sm"
                                            value={shortTemp === undefined ? '' : shortTemp}
                                            onChange={e => {
                                                const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                                setShortTemp(val);
                                            }}
                                            onBlur={saveTempOverrides}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-400 mb-1">Long Temp</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="Default"
                                            className="w-full bg-gray-700 rounded p-2 text-white text-sm"
                                            value={longTemp === undefined ? '' : longTemp}
                                            onChange={e => {
                                                const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                                setLongTemp(val);
                                            }}
                                            onBlur={saveTempOverrides}
                                        />
                                    </div>
                                </div>

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

                            <hr className="my-6 border-gray-700" />
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
                                <div className="flex justify-between items-center pt-2">
                                    {typeof showPersonaEdit !== 'string' ? (
                                        <button
                                            type="button"
                                            onClick={() => deletePersona(showPersonaEdit.id)}
                                            className="text-red-400 hover:text-red-300 px-2 py-2 text-sm"
                                        >
                                            Delete Persona
                                        </button>
                                    ) : <div></div>}
                                    <div className="flex space-x-2">
                                        <button type="button" onClick={() => setShowPersonaEdit(null)} className="text-gray-400 hover:text-white px-4 py-2">Cancel</button>
                                        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Save</button>
                                    </div>
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
                                <button onClick={() => {
                                    setShowLorebookManage(false);
                                    setEditingLorebook(null);
                                    setEditingEntry(null);
                                }} className="text-gray-400 hover:text-white">Close</button>
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
                                                <div className="flex space-x-2">
                                                    <button onClick={() => loadLorebookDetails(lb.id!)} className="text-blue-400 hover:text-blue-300">Edit</button>
                                                    <button onClick={() => deleteLorebook(lb.id!)} className="text-red-400 hover:text-red-300">Delete</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold">{typeof editingLorebook === 'string' ? 'New Book' : editingLorebook.name}</h3>
                                        <button onClick={() => {
                                            setEditingLorebook(null);
                                            setEditingEntry(null);
                                        }} className="text-gray-400 hover:text-white">Back to List</button>
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
                                                                    {entry.isAlwaysIncluded && <span className="text-xs bg-purple-900 text-purple-200 px-1 rounded border border-purple-700">Lore</span>}
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
                                                        <div className="flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                name="isAlwaysIncluded"
                                                                defaultChecked={typeof editingEntry !== 'string' ? editingEntry.isAlwaysIncluded : false}
                                                                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 mr-2"
                                                            />
                                                            <label className="text-sm text-gray-400">Always Included (Lore)</label>
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
                                            let content = viewingPrompt;
                                            try {
                                                const parsed = JSON.parse(viewingPrompt);
                                                if (parsed.prompt) content = parsed.prompt;
                                            } catch (e) { }
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

                    const swipeProps = (msg.role === 'assistant' && msg.id && msg.swipes && JSON.parse(msg.swipes).length > 1 && idx === messages.length - 1) ? {
                        onTouchStart,
                        onTouchMove,
                        onTouchEnd: () => onTouchEnd(msg.id!)
                    } : {};

                    return (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                            {/* Assistant Avatar (Left) */}
                            {msg.role === 'assistant' && (
                                <div className="w-8 h-8 rounded-full overflow-hidden relative flex-shrink-0 bg-gray-700">
                                    <Image src={character.avatarPath || '/placeholder.png'} alt={character.name} fill className="object-cover" unoptimized />
                                </div>
                            )}

                            <div
                                {...swipeProps}
                                className={`max-w-[80%] rounded-2xl relative group ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-none px-3 pb-3 pt-10'
                                    : 'bg-gray-700 text-gray-100 rounded-bl-none px-3 pb-3 pt-10'
                                    }`}
                            >
                                <div className="whitespace-pre-wrap">
                                    {/* Spacer for controls on mobile to prevent overlap */}
                                    <div
                                        className="float-right h-6 md:hidden"
                                        aria-hidden="true"
                                    />
                                    {formatMessage(msg.content, msg)}
                                </div>

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
                                <div className="absolute top-1 right-1 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    {msg.role === 'assistant' && (
                                        <>
                                            {(() => {
                                                const hasAudio = (() => {
                                                    try {
                                                        const paths = msg.audioPaths ? JSON.parse(msg.audioPaths) : [];
                                                        return !!paths[msg.currentIndex || 0];
                                                    } catch (e) { return false; }
                                                })();

                                                return (
                                                    <>
                                                        <button
                                                            onClick={() => playTTS(msg.content, msg.id, msg.currentIndex || 0, false)}
                                                            className="text-gray-400 hover:text-blue-400 p-1"
                                                            title={hasAudio ? (isPlaying && playingMessageId === msg.id ? "Pause" : "Play") : "Generate Audio"}
                                                            disabled={audioGeneratingId === msg.id}
                                                        >
                                                            {audioGeneratingId === msg.id ? (
                                                                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                                                            ) : hasAudio ? (
                                                                isPlaying && playingMessageId === msg.id ? (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                                        <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                                                    </svg>
                                                                )
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                        {hasAudio && (
                                                            <button
                                                                onClick={() => playTTS(msg.content, msg.id, msg.currentIndex || 0, true)}
                                                                className="text-gray-400 hover:text-blue-400 p-1"
                                                                title="Regenerate Audio"
                                                                disabled={audioGeneratingId === msg.id}
                                                            >
                                                                {audioGeneratingId === msg.id ? (
                                                                    // We can also just hide it or show same spinner. Let's show spinner if we want, or just disable it since the main button shows spinner.
                                                                    // User requested "Also when the regnerate audio button is clicked."
                                                                    // Let's show spinner here too if it was clicked? But we can only have one spinner state for the message.
                                                                    // If we use the same state, both buttons will spin if we don't differentiate.
                                                                    // Actually, usually you replace the button clicked with a spinner.
                                                                    // If we replace both with spinner it looks weird.
                                                                    // Let's just disable this one and let the main one spin?
                                                                    // Or better, let's make this one spin too if meaningful.
                                                                    // The requirement says: "when user clicks the generate audio button... icon should change... Also when the regnerate audio button is clicked."
                                                                    // I'll make the main Play button show spinner. And disable this one.
                                                                    // If user clicked Regenerate, the Play button will turn into a spinner (because hasAudio is true).
                                                                    // Wait, if hasAudio is true, the first button shows Play/Pause.
                                                                    // If I click Regenerate, playTTS sets loading.
                                                                    // The first button condition: audioGeneratingId === msg.id ? SPINNER : hasAudio ? PLAY : GEN
                                                                    // So the first button becomes a spinner.
                                                                    // The second button (Regenerate) is still visible. I should probably just disable it or make it spin too?
                                                                    // Let's disable it to avoid confusion.
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 opacity-50">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </>
                                    )}
                                    <button
                                        onClick={() => handleCopy(msg.content, (msg as any).id || idx)}
                                        className="text-gray-400 hover:text-white p-1"
                                        title="Copy"
                                    >
                                        {copiedId === ((msg as any).id || idx) ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-400">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5" />
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => deleteMessage((msg as any).id)}
                                        className="text-gray-400 hover:text-red-400 p-1"
                                        title="Delete from here"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                    </button>
                                </div>
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
            <div className="p-3 bg-gray-800 border-t border-gray-700 relative">
                <div className="flex items-end gap-2 bg-gray-900 rounded-2xl p-2 border border-gray-700 focus-within:border-blue-500 transition-colors relative">
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
                        ref={textareaRef}
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
                        style={{ minHeight: '88px' }}
                    />

                    <div className="flex flex-col gap-2">
                        <div className="relative">
                            <button
                                ref={emojiButtonRef}
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                className="p-2 text-gray-400 hover:text-yellow-400 transition-colors rounded-full hover:bg-gray-800"
                                title="Add Emoji"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm7.5 0c0 .414-.168.75-.375.75S16.5 10.164 16.5 9.75 16.668 9 16.875 9s.375.336.375.75z" />
                                </svg>
                            </button>
                            {showEmojiPicker && (
                                <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: '100%', right: '0', marginBottom: '8px', zIndex: 50 }}>
                                    <EmojiPicker onEmojiClick={onEmojiClick} theme={Theme.DARK} width={300} height={400} />
                                </div>
                            )}
                        </div>
                        <button
                            onClick={sendMessage}
                            disabled={isLoading || !input.trim()}
                            className="p-2 bg-blue-600 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Delete Character Confirmation Modal */}
            {
                showDeleteCharConfirm && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]" style={{ zIndex: 9999 }}>
                        <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 relative z-[10000]" style={{ zIndex: 10000 }}>
                            <h2 className="text-xl font-bold mb-4 text-red-500">Delete Character?</h2>
                            <p className="text-gray-300 mb-6">
                                Are you sure you want to delete <span className="font-bold text-white">{character?.name}</span>?
                                This will permanently delete the character, all chat sessions, voices, images, and videos.
                                This action cannot be undone.
                            </p>

                            <div className="mb-6 bg-gray-700 p-3 rounded">
                                <label className="flex items-center space-x-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={deleteCharWithLorebook}
                                        onChange={e => setDeleteCharWithLorebook(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-red-600 focus:ring-red-500"
                                    />
                                    <span className="text-sm">Also delete associated Lorebooks?</span>
                                </label>
                                {deleteCharWithLorebook && (
                                    <p className="text-xs text-red-400 mt-2 pl-8">
                                        Warning: This will delete any Lorebook listed in this character's profile.
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => setShowDeleteCharConfirm(false)}
                                    className="px-4 py-2 text-gray-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteCharacter}
                                    className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded"
                                >
                                    Confirm Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
