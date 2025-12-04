'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Character {
  filename: string;
  name: string;
  avatarUrl: string;
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
          SillyTavern Mobile
        </h1>
        {/* Settings Icon could go here */}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {characters.map((char) => (
          <Link
            href={`/chat/${char.filename}`}
            key={char.filename}
            className="group relative block aspect-[3/4] rounded-xl overflow-hidden bg-gray-800 shadow-lg transition-transform hover:scale-105"
          >
            <Image
              src={char.avatarUrl}
              alt={char.name}
              fill
              className="object-cover transition-opacity group-hover:opacity-80"
              sizes="(max-width: 768px) 50vw, 33vw"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-10">
              <h2 className="text-white font-semibold text-sm truncate">
                {char.name}
              </h2>
            </div>
          </Link>
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
