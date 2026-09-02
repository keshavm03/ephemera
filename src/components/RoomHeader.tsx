'use client';

import { useState } from 'react';
import type { ConnectionState } from '@/hooks/useRoomStream';
import type { SessionClaims } from '@/lib/types';

const STATUS_LABEL: Record<ConnectionState, { text: string; dot: string }> = {
  connecting: { text: 'Connecting', dot: 'bg-amber-400' },
  live: { text: 'Live', dot: 'bg-emerald-400' },
  reconnecting: { text: 'Reconnecting', dot: 'bg-amber-400' },
  ended: { text: 'Ended', dot: 'bg-rose-400' },
};

export default function RoomHeader({
  code,
  title,
  status,
  me,
  memberCount,
  onToggleSidebar,
  onLeave,
  onTerminate,
}: {
  code: string;
  title: string;
  status: ConnectionState;
  me: SessionClaims;
  memberCount: number;
  onToggleSidebar: () => void;
  onLeave: () => void;
  onTerminate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const badge = STATUS_LABEL[status];

  async function copyInvite() {
    const link = `${window.location.origin}/r/${code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard is blocked in some embedded browsers; the code stays visible
      // in the header so it can still be read out or typed.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900/70 px-3 py-2.5 backdrop-blur sm:px-4">
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle channels"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-ink-700 text-ink-200 transition hover:bg-ink-800 md:hidden"
      >
        ☰
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-sm font-medium sm:text-base">{title}</h1>
          <span className="hidden items-center gap-1.5 rounded-full border border-ink-700 px-2 py-0.5 text-[11px] text-ink-400 sm:inline-flex">
            <span className={`size-1.5 rounded-full ${badge.dot}`} />
            {badge.text}
          </span>
        </div>
        <p className="truncate text-xs text-ink-400">
          {memberCount} {memberCount === 1 ? 'person' : 'people'} · you are{' '}
          <span style={{ color: me.color }}>{me.name}</span>
        </p>
      </div>

      <button
        onClick={copyInvite}
        title="Copy the invite link"
        className="shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 font-mono text-xs tracking-[0.2em] text-ink-50 transition hover:bg-ink-800"
      >
        {copied ? '✓ copied' : code}
      </button>

      {me.host ? (
        confirming ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onTerminate}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
            >
              Delete everything
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-200 transition hover:bg-ink-800"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10"
          >
            End room
          </button>
        )
      ) : (
        <button
          onClick={onLeave}
          className="shrink-0 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-200 transition hover:bg-ink-800"
        >
          Leave
        </button>
      )}
    </header>
  );
}
