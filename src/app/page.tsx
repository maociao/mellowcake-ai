'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { SettingsModal } from '@/components/SettingsModal';
import { CharacterCreateModal } from '@/components/CharacterCreateModal';

interface Character {
  id: number;
  name: string;
  avatarPath: string;
  defaultVideoPath?: string | null;
}

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchCharacters = () => {
    fetch('/api/characters')
      .then((res) => res.json())
      .then((data) => {
        setCharacters(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCharacters();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <main className="p-4 pb-20">
      <header className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
          Mellowcake AI
        </h1>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="LLM Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
        </button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {/* Add Character Card */}
        <div
          onClick={() => setShowCreate(true)}
          className="aspect-[3/4] rounded-xl border-2 border-dashed border-gray-700 hover:border-blue-500 flex items-center justify-center cursor-pointer transition-colors group bg-gray-900/50"
        >
          <div className="text-gray-600 group-hover:text-blue-500 flex flex-col items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="font-semibold text-sm">Add Character</span>
          </div>
        </div>

        {characters.map((char) => (
          <div
            key={char.id}
            className="group relative block aspect-[3/4] rounded-xl overflow-hidden bg-gray-800 shadow-lg transition-transform hover:scale-105 cursor-pointer"
            onMouseEnter={(e) => {
              const video = e.currentTarget.querySelector('video');
              if (video) video.play();
            }}
            onMouseLeave={(e) => {
              const video = e.currentTarget.querySelector('video');
              if (video) {
                video.pause();
                video.currentTime = 0;
              }
            }}
          >
            <Link href={`/chat/${char.id}`}
              onClick={(e) => {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (isMobile) {
                  const now = Date.now();
                  const lastClick = (e.currentTarget as any).lastClick || 0;
                  if (now - lastClick < 300) {
                    return; // Double tap - allow navigation
                  }
                  e.preventDefault();
                  (e.currentTarget as any).lastClick = now;

                  const container = e.currentTarget.closest('div');
                  const video = container?.querySelector('video');
                  if (video) {
                    if (video.paused) video.play();
                    else video.pause();
                  }
                }
              }}
              className="absolute inset-0 z-10"
            />

            <Image
              src={char.avatarPath || '/placeholder.png'}
              alt={char.name}
              fill
              className="object-cover transition-opacity group-hover:opacity-80"
              sizes="(max-width: 768px) 50vw, 33vw"
              unoptimized
            />

            {/* Video Layer */}
            {char.defaultVideoPath && (
              <video
                src={char.defaultVideoPath}
                className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                loop
                muted
                playsInline
                // onPlay/onPause handled by parent hover to avoid flickering or complexity
                onPlay={(e) => e.currentTarget.classList.remove('opacity-0')}
                onPause={(e) => e.currentTarget.classList.add('opacity-0')}
              />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-10 pointer-events-none">
              <h2 className="text-white font-semibold text-sm truncate">
                {char.name}
              </h2>
            </div>
          </div>
        ))}
      </div>

      {characters.length === 0 && (
        <div className="text-center text-gray-400 mt-10">
          No characters found. Tap + to add one.
        </div>
      )}

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <CharacterCreateModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(newChar) => {
          setCharacters(prev => [...prev, newChar]);
        }}
      />
    </main>
  );
}
