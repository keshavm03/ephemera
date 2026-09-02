'use client';

import { useEffect, useRef, useState } from 'react';
import { STICKER_PACKS } from '@/lib/stickers';
import type { OutgoingMessage } from './RoomClient';

type Tray = null | 'sticker' | 'gif';

export default function Composer({
  onSend,
  disabled,
  placeholder,
}: {
  onSend: (m: OutgoingMessage) => void | Promise<void>;
  disabled: boolean;
  placeholder: string;
}) {
  const [text, setText] = useState('');
  const [tray, setTray] = useState<Tray>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to a ceiling, then scroll inside.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  function submit() {
    const body = text.trim();
    if (!body || disabled) return;
    setText('');
    setTray(null);
    void onSend({ kind: 'text', body });
  }

  return (
    <div className="shrink-0 border-t border-ink-800 bg-ink-900/70 backdrop-blur">
      {tray === 'sticker' && (
        <StickerTray
          onPick={(s) => {
            void onSend({ kind: 'sticker', body: s });
            setTray(null);
          }}
        />
      )}
      {tray === 'gif' && (
        <GifTray
          onPick={(gif) => {
            void onSend({ kind: 'gif', body: gif.url, meta: { w: gif.w, h: gif.h, alt: gif.title } });
            setTray(null);
          }}
        />
      )}

      <div className="mx-auto flex max-w-3xl items-end gap-2 px-3 py-3 sm:px-5">
        <TrayButton label="Stickers" icon="😀" active={tray === 'sticker'} disabled={disabled}
          onClick={() => setTray((t) => (t === 'sticker' ? null : 'sticker'))} />
        <TrayButton label="GIFs" icon="GIF" active={tray === 'gif'} disabled={disabled} mono
          onClick={() => setTray((t) => (t === 'gif' ? null : 'gif'))} />

        <textarea
          ref={box}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline — the convention people
            // already have muscle memory for.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-ink-400 focus:border-accent disabled:opacity-50"
        />

        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          aria-label="Send message"
          className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-accent text-white transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

function TrayButton({
  label, icon, active, disabled, mono, onClick,
}: {
  label: string; icon: string; active: boolean; disabled: boolean; mono?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`grid size-[42px] shrink-0 place-items-center rounded-xl border transition disabled:opacity-40 ${
        active ? 'border-accent bg-accent/15' : 'border-ink-700 bg-ink-850 hover:bg-ink-800'
      } ${mono ? 'font-mono text-[10px] font-bold tracking-tight text-ink-200' : 'text-lg'}`}
    >
      {icon}
    </button>
  );
}

function StickerTray({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="max-h-56 overflow-y-auto border-b border-ink-800 px-3 py-3 sm:px-5">
      <div className="mx-auto max-w-3xl">
        {STICKER_PACKS.map((pack) => (
          <div key={pack.name} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-400">
              {pack.name}
            </p>
            <div className="flex flex-wrap gap-1">
              {pack.stickers.map((s) => (
                <button
                  key={s}
                  onClick={() => onPick(s)}
                  className="grid size-11 place-items-center rounded-lg text-2xl transition hover:scale-110 hover:bg-ink-800"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Gif { id: string; title: string; url: string; preview: string; w?: number; h?: number }

function GifTray({ onPick }: { onPick: (g: Gif) => void }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'off' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    // Debounced so typing doesn't fire a request per keystroke.
    const timer = setTimeout(async () => {
      setState('loading');
      try {
        const res = await fetch(`/api/giphy?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error();
        if (!data.enabled) return setState('off');
        setGifs(data.gifs);
        setState('ready');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setState('error');
      }
    }, query ? 350 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="border-b border-ink-800 px-3 py-3 sm:px-5">
      <div className="mx-auto max-w-3xl">
        {state === 'off' ? (
          <p className="py-4 text-center text-xs leading-relaxed text-ink-400">
            GIF search is off. Add a free <code className="font-mono text-ink-200">GIPHY_API_KEY</code>{' '}
            environment variable to switch it on — stickers work either way.
          </p>
        ) : (
          <>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs…"
              className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none placeholder:text-ink-400 focus:border-accent"
            />
            <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
              {state === 'loading' &&
                Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-ink-800" />
                ))}
              {state === 'ready' && gifs.length === 0 && (
                <p className="col-span-full py-4 text-center text-xs text-ink-400">
                  No GIFs for “{query}”.
                </p>
              )}
              {state === 'ready' &&
                gifs.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => onPick(g)}
                    className="h-24 overflow-hidden rounded-lg border border-ink-700 transition hover:border-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.preview} alt={g.title} loading="lazy" className="size-full object-cover" />
                  </button>
                ))}
              {state === 'error' && (
                <p className="col-span-full py-4 text-center text-xs text-rose-400">
                  GIF search is unavailable right now.
                </p>
              )}
            </div>
            <p className="mt-2 text-right text-[10px] text-ink-400">Powered by GIPHY</p>
          </>
        )}
      </div>
    </div>
  );
}
