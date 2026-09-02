'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { randomName } from '@/lib/names';

export default function Landing({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The name field starts empty and shows a suggestion as placeholder, so an
  // impatient person can just hit enter and still get a usable handle.
  const [suggestion] = useState(() => randomName());

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || suggestion, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not create the room');
      router.push(`/r/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(null);
    }
  }

  async function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setBusy('join');
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${clean}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || suggestion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not join');
      router.push(`/r/${clean}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center px-5 py-14">
      <header className="mb-10">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/70 px-3 py-1 text-xs text-ink-200">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse-ring" />
          No account. No history. No trace.
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Ephemera
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-200 sm:text-lg">
          Open a room, share the code, talk. Text, GIFs, stickers and private
          DMs inside the same room. When the host ends it, the entire
          transcript is deleted — including every DM.
        </p>
      </header>

      {!configured && (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="font-medium">Server not configured yet.</p>
          <p className="mt-1 text-amber-200/80">
            Set <code className="font-mono">KV_REST_API_URL</code>,{' '}
            <code className="font-mono">KV_REST_API_TOKEN</code> and{' '}
            <code className="font-mono">SESSION_SECRET</code>. See the README.
          </p>
        </div>
      )}

      <div className="mb-6">
        <label htmlFor="name" className="mb-2 block text-sm font-medium text-ink-200">
          Your name for this session
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={suggestion}
          maxLength={24}
          autoComplete="off"
          className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-4 py-3 text-base outline-none transition placeholder:text-ink-400 focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <p className="mt-2 text-xs text-ink-400">
          Made up on the spot, never stored anywhere but the room itself.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <form
          onSubmit={createRoom}
          className="flex flex-col rounded-2xl border border-ink-700 bg-ink-900/60 p-5 backdrop-blur"
        >
          <h2 className="text-lg font-medium">Start a room</h2>
          <p className="mt-1 mb-4 text-sm text-ink-400">
            You become the host — the only one who can end it.
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Room name (optional)"
            maxLength={48}
            className="mb-3 w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm outline-none transition placeholder:text-ink-400 focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy !== null || !configured}
            className="mt-auto rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'create' ? 'Opening…' : 'Create room'}
          </button>
        </form>

        <form
          onSubmit={joinRoom}
          className="flex flex-col rounded-2xl border border-ink-700 bg-ink-900/60 p-5 backdrop-blur"
        >
          <h2 className="text-lg font-medium">Join a room</h2>
          <p className="mt-1 mb-4 text-sm text-ink-400">
            Enter the code someone shared with you.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={10}
            autoCapitalize="characters"
            autoComplete="off"
            className="mb-3 w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 font-mono text-sm tracking-[0.25em] outline-none transition placeholder:tracking-normal placeholder:font-sans placeholder:text-ink-400 focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy !== null || !code.trim() || !configured}
            className="mt-auto rounded-lg border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm font-medium transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'join' ? 'Joining…' : 'Join'}
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-400">
          {error}
        </p>
      )}

      <footer className="mt-12 grid gap-3 border-t border-ink-800 pt-6 text-xs text-ink-400 sm:grid-cols-3">
        <p><strong className="text-ink-200">Ends on command.</strong> The host hits “End room” and the data is deleted seconds later.</p>
        <p><strong className="text-ink-200">Ends on its own.</strong> A room with no activity for 12 hours expires by itself.</p>
        <p><strong className="text-ink-200">DMs stay private.</strong> Direct messages are filtered server-side — they never reach anyone else’s browser.</p>
      </footer>
    </main>
  );
}
