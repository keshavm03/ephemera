'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage, SessionClaims } from '@/lib/types';

/**
 * Mounted with `key={channel}` by the parent, so switching conversations gives
 * a fresh component: `pinned` starts true again and the layout effect below
 * lands on the newest message. That replaces an effect which reset the same
 * state after render — a cascading render React now flags outright.
 */
export default function MessageList({
  messages,
  me,
  code,
}: {
  messages: ChatMessage[];
  me: SessionClaims;
  code: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Tapping a photo opens it full size. Held here so only one can be open, and
  // so Escape has a single thing to close.
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  // Only auto-scroll while the reader is already at the bottom. Yanking someone
  // away from something they scrolled up to read is the classic chat-UI sin.
  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [messages, pinned]);

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-5"
    >
      {messages.length === 0 && (
        <p className="mt-10 text-center text-sm text-ink-400">
          Nothing here yet. Say something.
        </p>
      )}

      <ul className="mx-auto flex max-w-3xl flex-col gap-0.5">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          // Group consecutive messages from one person within two minutes, so
          // a burst reads as one turn instead of five separate headers.
          const grouped =
            prev &&
            prev.from === m.from &&
            prev.kind !== 'system' &&
            m.kind !== 'system' &&
            m.ts - prev.ts < 120_000;

          return (
            <Bubble
              key={m.id}
              message={m}
              mine={m.from === me.uid}
              grouped={Boolean(grouped)}
              code={code}
              onOpenPhoto={setLightbox}
            />
          );
        })}
      </ul>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <button
            onClick={() => setLightbox(null)}
            aria-label="Close photo"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-ink-900/80 text-lg text-ink-50"
          >
            ✕
          </button>
        </div>
      )}

      {!pinned && (
        <button
          onClick={() => setPinned(true)}
          className="sticky bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          Jump to latest ↓
        </button>
      )}
    </div>
  );
}

function Bubble({
  message,
  mine,
  grouped,
  code,
  onOpenPhoto,
}: {
  message: ChatMessage;
  mine: boolean;
  grouped: boolean;
  code: string;
  onOpenPhoto: (src: string) => void;
}) {
  if (message.kind === 'system') {
    return (
      <li className="my-2 text-center text-xs text-ink-400 animate-rise">{message.body}</li>
    );
  }

  return (
    <li className={`flex animate-rise ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0' : 'mt-3'}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
        {!grouped && (
          <div className={`mb-1 flex items-baseline gap-2 px-1 text-xs ${mine ? 'flex-row-reverse' : ''}`}>
            <span className="font-medium" style={{ color: message.fromColor }}>
              {mine ? 'You' : message.fromName}
            </span>
            <time className="text-ink-400" dateTime={new Date(message.ts).toISOString()}>
              {new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>
        )}

        {message.kind === 'text' && (
          <div
            className={`msg-body rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              mine
                ? 'rounded-br-md bg-accent text-white'
                : 'rounded-bl-md border border-ink-700 bg-ink-850 text-ink-50'
            }`}
          >
            {message.body}
          </div>
        )}

        {message.kind === 'sticker' && (
          <div className="px-1 text-5xl leading-none select-none" role="img" aria-label="sticker">
            {message.body}
          </div>
        )}

        {message.kind === 'photo' && (
          <button
            onClick={() => onOpenPhoto(`/api/rooms/${code}/photos/${message.body}`)}
            className="block overflow-hidden rounded-xl border border-ink-700 bg-ink-850 transition hover:border-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/rooms/${code}/photos/${message.body}`}
              alt={message.meta?.alt || 'Photo'}
              width={message.meta?.w}
              height={message.meta?.h}
              loading="lazy"
              // Reserving the ratio keeps the list from jumping as photos decode.
              style={
                message.meta?.w && message.meta?.h
                  ? { aspectRatio: `${message.meta.w} / ${message.meta.h}` }
                  : undefined
              }
              className="max-h-80 w-auto max-w-full object-contain"
            />
          </button>
        )}

        {message.kind === 'gif' && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={message.body}
            alt={message.meta?.alt || 'GIF'}
            width={message.meta?.w}
            height={message.meta?.h}
            loading="lazy"
            // Reserving the aspect ratio stops the list from jolting as GIFs
            // decode at different times.
            style={
              message.meta?.w && message.meta?.h
                ? { aspectRatio: `${message.meta.w} / ${message.meta.h}` }
                : undefined
            }
            className="max-h-72 w-auto max-w-full rounded-xl border border-ink-700 bg-ink-850 object-contain"
          />
        )}
      </div>
    </li>
  );
}
