'use client';

import { useCallback, useState } from 'react';
import type { Game, GameKind } from '@/lib/games/types';
import type { SessionClaims as Session } from '@/lib/types';
import { ENGINES, GAME_ORDER } from '@/lib/games';
import { BoardFor, seatColor } from './Boards';

/**
 * The game surface for a room.
 *
 * It holds no board state of its own. Every move is posted to the server and
 * the result arrives back over the room's SSE stream like any other message,
 * so two people watching the same table cannot drift apart — there is exactly
 * one copy of the truth and it is the server's.
 */
export default function GamePanel({
  game,
  me,
  code,
  onClose,
}: {
  game: Game | null;
  me: Session;
  code: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${code}/game`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'That did not work');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not work');
      } finally {
        setBusy(false);
      }
      // No local state update: the authoritative board comes back on the stream.
    },
    [code]
  );

  const seat = game?.players.find((p) => p.uid === me.uid)?.seat ?? null;
  const myTurn = Boolean(game && game.status === 'active' && seat !== null && game.turn === seat);

  const onMove = useCallback(
    (move: Record<string, unknown>) => post({ action: 'move', move, version: game?.version }),
    [post, game?.version]
  );

  return (
    <section className="flex max-h-[70dvh] min-h-0 flex-col border-b border-ink-800 bg-ink-900/40">
      <header className="flex items-center justify-between px-4 py-2">
        <h2 className="text-sm font-medium">
          {game ? `${ENGINES[game.kind].icon} ${ENGINES[game.kind].label}` : '🎮 Games'}
        </h2>
        <div className="flex items-center gap-2">
          {game && (game.openedBy === me.uid || me.host) && (
            <button
              onClick={() => post({ action: 'close' })}
              disabled={busy}
              className="rounded-lg border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-rose-500/50 hover:text-rose-300"
            >
              Close table
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Hide games"
            className="rounded-lg border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-accent"
          >
            Hide
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {!game && <Lobby busy={busy} onOpen={(kind, seats) => post({ action: 'open', kind, seats })} />}

        {game && (
          <>
            <Roster game={game} me={me} />

            {game.status === 'waiting' && (
              <div className="mb-3 rounded-xl border border-ink-700 bg-ink-850 p-3 text-center">
                <p className="text-sm text-ink-300">
                  Waiting for players — {game.players.length}/{game.seats} seated
                </p>
                {seat === null && (
                  <button
                    onClick={() => post({ action: 'sit' })}
                    disabled={busy}
                    className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-soft disabled:opacity-50"
                  >
                    Take a seat
                  </button>
                )}
              </div>
            )}

            {game.status !== 'waiting' && (
              <BoardFor game={game} seat={seat} myTurn={myTurn} onMove={onMove} busy={busy} />
            )}

            <p className="mt-3 text-center text-xs text-ink-400">{game.note}</p>

            {game.status === 'active' && (
              <p className="mt-1 text-center text-xs">
                {myTurn ? (
                  <span className="font-medium text-accent">Your turn</span>
                ) : (
                  <span className="text-ink-400">
                    {game.players[game.turn]?.name ?? 'Someone'} to play
                  </span>
                )}
              </p>
            )}

            {game.status === 'over' && (
              <div className="mt-3 text-center">
                <p className="text-sm font-medium">
                  {game.winner === null
                    ? 'Draw'
                    : game.winner === seat
                      ? 'You won'
                      : `${game.players[game.winner]?.name ?? 'Someone'} won`}
                </p>
                <button
                  onClick={() => post({ action: 'close' })}
                  disabled={busy}
                  className="mt-2 rounded-lg border border-ink-700 px-4 py-2 text-xs text-ink-300 transition hover:border-accent"
                >
                  Clear the table
                </button>
              </div>
            )}

            {game.status === 'active' && seat !== null && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => post({ action: 'resign' })}
                  disabled={busy}
                  className="text-xs text-ink-400 underline-offset-2 transition hover:text-rose-300 hover:underline"
                >
                  Resign
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-300">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function Lobby({
  busy,
  onOpen,
}: {
  busy: boolean;
  onOpen: (kind: GameKind, seats: number) => void;
}) {
  const [seats, setSeats] = useState<Record<string, number>>({});

  return (
    <div className="space-y-2">
      <p className="mb-3 text-xs text-ink-400">
        Open a table and anyone in the room can take a seat. Games end with the room.
      </p>
      {GAME_ORDER.map((kind) => {
        const engine = ENGINES[kind];
        const chosen = seats[kind] ?? engine.minSeats;
        return (
          <div key={kind} className="rounded-xl border border-ink-700 bg-ink-850 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {engine.icon} {engine.label}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">{engine.blurb}</p>
              </div>
              <button
                onClick={() => onOpen(kind, chosen)}
                disabled={busy}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-soft disabled:opacity-50"
              >
                Open
              </button>
            </div>
            {engine.maxSeats > engine.minSeats && (
              <div className="mt-2 flex items-center gap-2 text-xs text-ink-400">
                <span>Players:</span>
                {Array.from(
                  { length: engine.maxSeats - engine.minSeats + 1 },
                  (_, i) => engine.minSeats + i
                ).map((n) => (
                  <button
                    key={n}
                    onClick={() => setSeats((prev) => ({ ...prev, [kind]: n }))}
                    className={`rounded-md border px-2 py-0.5 transition ${
                      chosen === n
                        ? 'border-accent bg-accent/10 text-ink-50'
                        : 'border-ink-700 hover:border-ink-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Roster({ game, me }: { game: Game; me: Session }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
      {Array.from({ length: game.seats }, (_, s) => {
        const player = game.players[s];
        const active = game.status === 'active' && game.turn === s;
        return (
          <span
            key={s}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              active ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-850'
            }`}
          >
            <span className="size-2 rounded-full" style={{ background: seatColor(game, s) }} />
            {player ? (
              <>
                {player.name}
                {player.uid === me.uid && <span className="text-ink-400">(you)</span>}
              </>
            ) : (
              <span className="text-ink-400">empty</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
