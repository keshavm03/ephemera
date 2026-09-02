'use client';

import Link from 'next/link';

/** Terminal state: the room's data is already being deleted server-side. */
export default function EndedOverlay({ by }: { by: string | null }) {
  const expired = by === 'inactivity';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/90 px-6 backdrop-blur-md">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-ink-700 bg-ink-900 text-2xl">
          🌫️
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {expired ? 'The room expired.' : 'The room has ended.'}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-400">
          {expired
            ? 'It sat idle too long and cleaned itself up.'
            : `${by ?? 'The host'} ended this room.`}{' '}
          Every message, GIF and private DM in it has been deleted. There is no copy.
        </p>
        <Link
          href="/"
          className="mt-7 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-soft"
        >
          Start a new room
        </Link>
      </div>
    </div>
  );
}
