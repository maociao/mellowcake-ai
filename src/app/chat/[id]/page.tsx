'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    promptUsed?: string;
}

interface CharacterDetails {
    id: number;
    name: string;
    avatarPath: string;
    description?: string;
    firstMessage?: string;
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
    avatarPath?: string;
}

interface Lorebook {
    filename: string; // API returns filename from ST
    name: string;
}

export default function ChatPage() {
    const params = useParams();
    const characterId = parseInt(params.id as string);
    const router = useRouter();

    const [character, setCharacter] = useState<CharacterDetails | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Session State
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
    const [showSessions, setShowSessions] = useState(false);

    // Settings State (Personas & Lorebooks)
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
    const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
    const [selectedLorebooks, setSelectedLorebooks] = useState<string[]>([]);
    const [showSettings, setShowSettings] = useState(false);

    // Prompt Inspection State
    const [viewingPrompt, setViewingPrompt] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load Data
    useEffect(() => {
        if (isNaN(characterId)) return;

        const loadData = async () => {
            try {
                // 1. Get Character
                const charRes = await fetch(`/api/characters/${characterId}`);
                if (charRes.ok) {
                    const charData = await charRes.json();
                    setCharacter(charData);

                    // 2. Get Sessions
                    const sessionsRes = await fetch(`/api/chats?characterId=${characterId}`);
                    if (sessionsRes.ok) {
                        const sessionsData = await sessionsRes.json();
                        setSessions(sessionsData);

                        if (sessionsData.length > 0) {
                            selectSession(sessionsData[0].id);
                        } else {
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
                // Set session persona if exists
                if (data.personaId) {
                    setSelectedPersonaId(data.personaId);
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
                    personaId: selectedPersonaId // Use currently selected persona
                })
            });
            if (res.ok) {
                const newSession = await res.json();
                setSessions(prev => [newSession, ...prev]);
                setCurrentSessionId(newSession.id);
                setMessages([]);
                setShowSessions(false);

                if (character?.firstMessage) {
                    setMessages([{ role: 'assistant', content: character.firstMessage }]);
                }
            }
        } catch (e) {
            console.error('Failed to create session', e);
        }
    };

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading || !currentSessionId) return;

        const userMessage: Message = { role: 'user', content: input };
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

            const assistantMsg = await response.json();
            setMessages(prev => [...prev, assistantMsg]);
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get response.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleLorebook = (filename: string) => {
        setSelectedLorebooks(prev =>
            prev.includes(filename)
                ? prev.filter(f => f !== filename)
                : [...prev, filename]
        );
    };

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
                <div className="relative w-10 h-10 rounded-full overflow-hidden mr-3">
                    <Image src={character.avatarPath || '/placeholder.png'} alt={character.name} fill className="object-cover" unoptimized />
                </div>
                <div className="flex-1 overflow-hidden">
                    <h1 className="font-semibold text-lg truncate">{character.name}</h1>
                    <button onClick={() => setShowSessions(!showSessions)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center">
                        {currentSessionId ? `Session #${currentSessionId}` : 'New Session'}
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
                            New Chat
                        </button>
                        <div className="space-y-2">
                            {sessions.map(session => (
                                <button
                                    key={session.id}
                                    onClick={() => selectSession(session.id)}
                                    className={`w-full text-left p-3 rounded-lg border ${currentSessionId === session.id
                                        ? 'border-blue-500 bg-blue-900/20 text-blue-100'
                                        : 'border-gray-700 hover:bg-gray-700'
                                        }`}
                                >
                                    <div className="font-medium truncate">{session.name || `Session ${session.id}`}</div>
                                    <div className="text-xs text-gray-400">{new Date(session.updatedAt).toLocaleString()}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal (Personas & Lorebooks) */}
            {showSettings && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Settings</h2>
                            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Personas */}
                        <div className="mb-6">
                            <h3 className="font-semibold text-gray-400 text-sm uppercase tracking-wider mb-2">Persona</h3>
                            <div className="space-y-2">
                                {personas.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setSelectedPersonaId(p.id)}
                                        className={`w-full text-left p-2 rounded flex items-center space-x-3 ${selectedPersonaId === p.id ? 'bg-blue-900/40 text-blue-100' : 'hover:bg-gray-700'}`}
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
                                ))}
                                {personas.length === 0 && <p className="text-gray-500">No personas found.</p>}
                            </div>
                        </div>

                        {/* Lorebooks */}
                        <div>
                            <h3 className="font-semibold text-gray-400 text-sm uppercase tracking-wider mb-2">Memory Books</h3>
                            <div className="space-y-2">
                                {lorebooks.map(lb => (
                                    <label key={lb.filename} className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedLorebooks.includes(lb.filename)}
                                            onChange={() => toggleLorebook(lb.filename)}
                                            className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>{lb.name}</span>
                                    </label>
                                ))}
                                {lorebooks.length === 0 && <p className="text-gray-500">No memory books found.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Prompt View Modal */}
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
                            className={`max-w-[85%] rounded-2xl px-4 py-2 relative group ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-gray-700 text-gray-100 rounded-bl-none'
                                }`}
                        >
                            <div className="whitespace-pre-wrap text-sm md:text-base">
                                {msg.content}
                            </div>

                            {/* Log Button */}
                            {msg.promptUsed && (
                                <button
                                    onClick={() => setViewingPrompt(msg.promptUsed!)}
                                    className="absolute -bottom-6 left-0 text-xs text-gray-500 hover:text-gray-300 flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                    Log
                                </button>
                            )}
                        </div>
                    </div>
                ))}
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
