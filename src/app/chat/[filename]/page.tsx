'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    prompt?: string;
    swipes?: string[];
    swipe_id?: number;
}

interface CharacterDetails {
    name: string;
    avatarUrl: string;
    first_mes?: string;
    selected_lorebooks?: string[];
    selected_persona?: string; // Add this field
}

interface Persona {
    filename: string;
    name: string;
    avatarUrl?: string;
}

interface Lorebook {
    filename: string;
    name: string;
}

interface ChatSession {
    filename: string;
    created: string;
    last_message: string;
}

export default function ChatPage() {
    const params = useParams();
    const filename = decodeURIComponent(params.filename as string);
    const router = useRouter();

    const [character, setCharacter] = useState<CharacterDetails | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
    const [selectedLorebooks, setSelectedLorebooks] = useState<string[]>([]);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    // Session State
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSession, setCurrentSession] = useState<string | undefined>(undefined);
    const [showSessions, setShowSessions] = useState(false);

    // Prompt Inspection State
    const [viewingPrompt, setViewingPrompt] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const saveHistory = async (updatedMessages: Message[]) => {
        if (!currentSession) return;
        try {
            await fetch(`/api/chat/${filename}/history`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionFilename: currentSession,
                    messages: updatedMessages,
                    personaFilename: selectedPersona
                })
            });
        } catch (e) {
            console.error('Failed to save history', e);
        }
    };

    const handleSwipe = async (index: number, direction: 'left' | 'right') => {
        const msg = messages[index];
        if (!msg.swipes || msg.swipes.length <= 1) return;

        const currentSwipeId = msg.swipe_id || 0;
        let newSwipeId = direction === 'left' ? currentSwipeId - 1 : currentSwipeId + 1;

        if (newSwipeId < 0) newSwipeId = msg.swipes.length - 1;
        if (newSwipeId >= msg.swipes.length) newSwipeId = 0;

        const newMessages = [...messages];
        newMessages[index] = {
            ...msg,
            swipe_id: newSwipeId,
            content: msg.swipes[newSwipeId]
        };

        setMessages(newMessages);
        await saveHistory(newMessages);
    };

    const handleRegenerate = async (index: number) => {
        if (isLoading) return;

        const contextMessages = messages.slice(0, index);

        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: contextMessages,
                    characterFilename: filename,
                    lorebookFilenames: selectedLorebooks,
                    sessionFilename: currentSession,
                    save: false
                }),
            });

            if (!response.ok) throw new Error('Failed to regenerate');
            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantMessage = '';
            let currentPrompt = '';

            // Initialize new swipe
            setMessages(prev => {
                const newMsgs = [...prev];
                const msg = newMsgs[index];
                const swipes = msg.swipes ? [...msg.swipes] : [msg.content];
                if (!msg.swipes) swipes[0] = msg.content;

                swipes.push('');
                const newId = swipes.length - 1;

                newMsgs[index] = {
                    ...msg,
                    swipes: swipes,
                    swipe_id: newId,
                    content: ''
                };
                return newMsgs;
            });

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.type === 'meta') {
                            currentPrompt = json.prompt;
                            continue;
                        }
                        if (json.message?.content) {
                            assistantMessage += json.message.content;

                            setMessages(prev => {
                                const newMsgs = [...prev];
                                const msg = newMsgs[index];
                                const swipes = [...(msg.swipes || [])];
                                swipes[msg.swipe_id!] = assistantMessage;

                                newMsgs[index] = {
                                    ...msg,
                                    content: assistantMessage,
                                    swipes: swipes,
                                    prompt: currentPrompt || msg.prompt
                                };
                                return newMsgs;
                            });
                        }
                    } catch (e) { }
                }
            }

            setMessages(prev => {
                const finalMsgs = [...prev];
                saveHistory(finalMsgs);
                return finalMsgs;
            });

            setIsLoading(false);

        } catch (e) {
            console.error('Regeneration failed', e);
            setIsLoading(false);
        }
    };

    // Load Data
    useEffect(() => {
        if (!filename) return;

        const loadData = async () => {
            try {
                const [charRes, loreRes, personasRes, sessionsRes] = await Promise.all([
                    fetch(`/api/characters/${filename}`),
                    fetch('/api/lorebooks'),
                    fetch('/api/personas'),
                    fetch(`/api/chat/${filename}/sessions`)
                ]);

                if (charRes.ok) {
                    const charData = await charRes.json();
                    setCharacter(charData);

                    // Load saved lorebooks
                    if (charData.selected_lorebooks) {
                        setSelectedLorebooks(charData.selected_lorebooks);
                    }

                    // Load saved persona
                    if (charData.selected_persona) {
                        setSelectedPersona(charData.selected_persona);
                    }

                    // Handle Sessions
                    if (sessionsRes.ok) {
                        const sessionsData = await sessionsRes.json();
                        setSessions(sessionsData);

                        // Select latest session or none
                        if (sessionsData.length > 0) {
                            const latest = sessionsData[0].filename;
                            setCurrentSession(latest);
                            loadHistory(latest, charData);
                        } else if (charData.first_mes) {
                            setMessages([{ role: 'assistant', content: charData.first_mes }]);
                        }
                    }
                }

                if (loreRes.ok) {
                    const loreData = await loreRes.json();
                    setLorebooks(loreData);
                }

                if (personasRes.ok) {
                    const personasData = await personasRes.json();
                    setPersonas(personasData);
                }

            } catch (err) {
                console.error('Failed to load data:', err);
            }
        };


        loadData();
    }, [filename]);

    const loadHistory = async (sessionFilename: string, charData?: CharacterDetails) => {
        try {
            const res = await fetch(`/api/chat/${filename}/history?sessionFilename=${sessionFilename}`);
            if (res.ok) {
                const history = await res.json();
                if (history && history.length > 0) {
                    setMessages(history);
                } else if (charData?.first_mes) {
                    setMessages([{ role: 'assistant', content: charData.first_mes }]);
                } else {
                    setMessages([]);
                }
            }
        } catch (e) {
            console.error('Failed to load history', e);
        }
    };

    const handleSessionChange = (sessionFilename: string) => {
        setCurrentSession(sessionFilename);
        setShowSessions(false);
        // We need character data for first_mes fallback, but it's in state
        loadHistory(sessionFilename, character || undefined);
    };

    const createNewSession = async () => {
        try {
            const res = await fetch(`/api/chat/${filename}/sessions`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                const newSession = data.filename;

                // Refresh sessions list
                const sessionsRes = await fetch(`/api/chat/${filename}/sessions`);
                if (sessionsRes.ok) {
                    setSessions(await sessionsRes.json());
                }

                setCurrentSession(newSession);
                setShowSessions(false);

                // Reset messages
                if (character?.first_mes) {
                    setMessages([{ role: 'assistant', content: character.first_mes }]);
                } else {
                    setMessages([]);
                }
            }
        } catch (e) {
            console.error('Failed to create session', e);
        }
    };

    const toggleLorebook = async (lbFilename: string, checked: boolean) => {
        let newSelected: string[] = [];
        if (checked) {
            newSelected = [...selectedLorebooks, lbFilename];
        } else {
            newSelected = selectedLorebooks.filter(f => f !== lbFilename);
        }
        setSelectedLorebooks(newSelected);

        // Save settings
        try {
            await fetch(`/api/characters/${filename}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selected_lorebooks: newSelected })
            });
        } catch (e) {
            console.error('Failed to save settings', e);
        }
    };

    const handlePersonaChange = async (personaFilename: string) => {
        setSelectedPersona(personaFilename);
        // Save settings
        try {
            await fetch(`/api/characters/${filename}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selected_lorebooks: selectedLorebooks,
                    selected_persona: personaFilename
                })
            });
        } catch (e) {
            console.error('Failed to save settings', e);
        }
    }



    // Gesture State
    const touchStartRef = useRef<{ x: number, y: number, time: number } | null>(null);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleTouchStart = (index: number, e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };

        // Long Press for Log
        const msg = messages[index];
        if (msg.role === 'assistant' && msg.prompt) {
            longPressTimerRef.current = setTimeout(() => {
                setViewingPrompt(msg.prompt!);
                touchStartRef.current = null; // Cancel swipe if long press triggered
            }, 500);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        // If moved significantly, cancel long press
        if (touchStartRef.current) {
            const touch = e.touches[0];
            const diffX = Math.abs(touch.clientX - touchStartRef.current.x);
            const diffY = Math.abs(touch.clientY - touchStartRef.current.y);
            if (diffX > 10 || diffY > 10) {
                if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
        }
    };

    const handleTouchEnd = (index: number, e: React.TouchEvent) => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

        if (!touchStartRef.current) return;

        const touch = e.changedTouches[0];
        const diffX = touch.clientX - touchStartRef.current.x;
        const diffY = touch.clientY - touchStartRef.current.y;
        const timeDiff = Date.now() - touchStartRef.current.time;

        // Relaxed thresholds for better responsiveness
        // diffX > 30 (was 50), diffY < 100 (was 30), timeDiff < 500
        if (Math.abs(diffX) > 30 && Math.abs(diffY) < 100 && timeDiff < 500) {
            const msg = messages[index];
            if (msg.role === 'assistant') {
                if (diffX < 0) {
                    // Swipe Left
                    if (msg.swipes && (msg.swipe_id || 0) < msg.swipes.length - 1) {
                        handleSwipe(index, 'right'); // Next swipe (visual right is logical next)
                    } else if (index === messages.length - 1) {
                        // Last message and last swipe -> Regenerate
                        handleRegenerate(index);
                    }
                } else {
                    // Swipe Right
                    if (msg.swipes && (msg.swipe_id || 0) > 0) {
                        handleSwipe(index, 'left'); // Previous swipe
                    }
                }
            }
        }
        touchStartRef.current = null;
    };

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    characterFilename: filename,
                    lorebookFilenames: selectedLorebooks,
                    personaFilename: selectedPersona,
                    sessionFilename: currentSession, // Pass current session
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to send message: ${response.status} ${response.statusText} - ${errorText}`);
            }
            if (!response.body) throw new Error('No response body');

            // Handle streaming
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantMessage = '';
            let currentPrompt = '';

            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);

                        // Handle Metadata
                        if (json.type === 'meta') {
                            currentPrompt = json.prompt;
                            setMessages(prev => {
                                const newMessages = [...prev];
                                newMessages[newMessages.length - 1].prompt = currentPrompt;
                                return newMessages;
                            });
                            continue;
                        }

                        if (json.message?.content) {
                            assistantMessage += json.message.content;
                            setMessages(prev => {
                                const newMessages = [...prev];
                                const lastMsg = newMessages[newMessages.length - 1];
                                lastMsg.content = assistantMessage;
                                // Ensure prompt is preserved if it came earlier
                                if (currentPrompt) lastMsg.prompt = currentPrompt;
                                return newMessages;
                            });
                        }
                        if (json.done) {
                            setIsLoading(false);
                        }
                    } catch (e) {
                        console.error('Error parsing JSON chunk', e);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setIsLoading(false);
        }
    };

    if (!character) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900">
            {/* Header */}
            <header className="flex items-center p-3 bg-gray-800 border-b border-gray-700 shadow-md z-10">
                <Link href="/" className="mr-3 text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                </Link>
                <div className="relative w-10 h-10 rounded-full overflow-hidden mr-3">
                    <Image src={character.avatarUrl} alt={character.name} fill className="object-cover" />
                </div>
                <div className="flex-1 overflow-hidden">
                    <h1 className="font-semibold text-lg truncate">{character.name}</h1>
                    <button onClick={() => setShowSessions(!showSessions)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center">
                        {currentSession ? 'Current Session' : 'New Session'}
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
                            <button onClick={() => setShowSessions(false)} className="text-gray-400 hover:text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <button
                            onClick={createNewSession}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg mb-4 flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            New Chat
                        </button>
                        <div className="space-y-2">
                            {sessions.map(session => (
                                <button
                                    key={session.filename}
                                    onClick={() => handleSessionChange(session.filename)}
                                    className={`w-full text-left p-3 rounded-lg border ${currentSession === session.filename
                                        ? 'border-blue-500 bg-blue-900/20 text-blue-100'
                                        : 'border-gray-700 hover:bg-gray-700'
                                        }`}
                                >
                                    <div className="font-medium truncate">{session.filename}</div>
                                    <div className="text-xs text-gray-400">{session.last_message}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettings && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Lorebooks</h2>
                            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-2 mb-6">
                            <h3 className="font-semibold text-gray-400 text-sm uppercase tracking-wider mb-2">Lorebooks</h3>
                            {lorebooks.map(lb => (
                                <label key={lb.filename} className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedLorebooks.includes(lb.filename)}
                                        onChange={(e) => toggleLorebook(lb.filename, e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>{lb.name}</span>
                                </label>
                            ))}
                            {lorebooks.length === 0 && <p className="text-gray-500">No lorebooks found.</p>}
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-400 text-sm uppercase tracking-wider mb-2">Persona</h3>
                            {personas.map(p => (
                                <button
                                    key={p.filename}
                                    onClick={() => handlePersonaChange(p.filename)}
                                    className={`w-full text-left p-2 rounded flex items-center space-x-3 ${selectedPersona === p.filename ? 'bg-blue-900/40 text-blue-100' : 'hover:bg-gray-700'}`}
                                >
                                    <div className="w-8 h-8 rounded-full overflow-hidden relative bg-gray-600 flex-shrink-0">
                                        {p.avatarUrl ? (
                                            <Image src={p.avatarUrl} alt={p.name} fill className="object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-xs">{p.name[0]}</div>
                                        )}
                                    </div>
                                    <span className="truncate">{p.name}</span>
                                </button>
                            ))}
                            {personas.length === 0 && <p className="text-gray-500">No personas found.</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* Prompt Modal */}
            {viewingPrompt && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-2xl w-full max-w-2xl p-6 max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Raw Prompt</h2>
                            <button onClick={() => setViewingPrompt(null)} className="text-gray-400 hover:text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <pre className="flex-1 overflow-auto bg-gray-900 p-4 rounded text-xs md:text-sm font-mono whitespace-pre-wrap text-gray-300">
                            {viewingPrompt}
                        </pre>
                    </div>
                </div>
            )}

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            key={`${idx}-${msg.swipe_id}`} // Trigger animation on swipe change
                            className={`max-w-[85%] rounded-2xl px-4 py-2 relative group animate-slide-in ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-gray-700 text-gray-100 rounded-bl-none'
                                }`}
                            onTouchStart={(e) => handleTouchStart(idx, e)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={(e) => handleTouchEnd(idx, e)}
                        >
                            <div className="whitespace-pre-wrap text-sm md:text-base select-none">
                                {msg.content}
                                {msg.role === 'assistant' && isLoading && idx === messages.length - 1 && (!msg.content || msg.content.length === 0) && (
                                    <span className="text-gray-400 italic loading-dots block">Regenerating</span>
                                )}
                            </div>
                            {msg.role === 'assistant' && (
                                <div className="absolute -bottom-6 left-0 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex">
                                    {/* Swipe Controls (Desktop Hover Only) */}
                                    {/* Swipe Controls */}
                                    <div className="flex items-center space-x-1 text-gray-500">
                                        <button
                                            onClick={() => handleSwipe(idx, 'left')}
                                            disabled={!msg.swipes || msg.swipes.length <= 1}
                                            className="hover:text-white disabled:opacity-30"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                        <span className="text-xs">
                                            {(msg.swipe_id || 0) + 1}/{msg.swipes?.length || 1}
                                        </span>
                                        <button
                                            onClick={() => handleSwipe(idx, 'right')}
                                            disabled={!msg.swipes || msg.swipes.length <= 1}
                                            className="hover:text-white disabled:opacity-30"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Regenerate - Only for last message */}
                                    {idx === messages.length - 1 && (
                                        <button
                                            onClick={() => handleRegenerate(idx)}
                                            className="text-gray-500 hover:text-white"
                                            title="Regenerate"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                            </svg>
                                        </button>
                                    )}

                                    {/* Log */}
                                    {msg.prompt && (
                                        <button
                                            onClick={() => setViewingPrompt(msg.prompt!)}
                                            className="text-xs text-gray-500 hover:text-gray-300 flex items-center ml-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                            Log
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-gray-800 border-t border-gray-700">
                <div className="flex items-end gap-2 bg-gray-900 rounded-2xl p-2 border border-gray-700 focus-within:border-blue-500 transition-colors">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder="Type a message..."
                        className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none max-h-32 py-2 px-2"
                        rows={1}
                        style={{ minHeight: '44px' }}
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
        </div>
    );
}
