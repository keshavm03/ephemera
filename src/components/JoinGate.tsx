'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { randomName } from '@/lib/names';

/** Shown when someone opens a room link without a session cookie for it. */
export default function JoinGate({ code, title }: { code: string; title: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion] = useState(() => randomName());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || suggestion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not join');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="mb-2 font-mono text-xs tracking-[0.3em] text-accent-soft">{code}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-400">
        Pick a name for this session. No sign-up, no email — it lives and dies
        with the room.
      </p>

      <form onSubmit={submit} className="mt-7">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={suggestion}
          maxLength={24}
          autoComplete="off"
          className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-4 py-3 text-base outline-none transition placeholder:text-ink-400 focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-soft disabled:opacity-50"
        >
          {busy ? 'Joining…' : 'Enter room'}
        </button>
      </form>

      {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
    </main>
  );
}
