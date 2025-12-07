'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Character {
  id: number;
  name: string;
  avatarPath: string;
  defaultVideoPath?: string | null;
}

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        {/* Settings Icon could go here */}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
            onClick={(e) => {
              // Mobile tap logic
              const isMobile = window.matchMedia('(max-width: 768px)').matches;
              if (isMobile) {
                const video = e.currentTarget.querySelector('video');
                if (video) {
                  if (video.paused) {
                    video.play();
                  } else {
                    // If playing, second tap navigates
                    // But we need to distinguish between "pause" and "navigate"
                    // User said: "first press ... plays ... double tap starts chat"
                    // Double tap is hard to detect with just onClick without delay.
                    // Let's implement: Tap -> Toggle Play. Double Tap -> Navigate.
                    // We can use a custom hook or just check time between clicks.
                    // For now, let's just use the Link component but prevent default if we want to play?
                    // Actually, wrapping in Link makes it navigate immediately.
                    // I should remove Link wrapper and handle navigation programmatically.
                  }
                }
              }
            }}
          >
            <Link href={`/chat/${char.id}`}
              onClick={(e) => {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (isMobile) {
                  // Check for double tap
                  const now = Date.now();
                  const lastClick = (e.currentTarget as any).lastClick || 0;
                  if (now - lastClick < 300) {
                    // Double tap - allow navigation
                    return;
                  }

                  // Single tap - toggle video
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
                className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                loop
                muted
                playsInline
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
          No characters found.
        </div>
      )}
    </main>
  );
}
