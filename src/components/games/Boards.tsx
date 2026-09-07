'use client';

import { useMemo, useState } from 'react';
import type { Game } from '@/lib/games/types';
import { legalMoves, colourOf, squareName } from '@/lib/games/chess';
import { COLS, ROWS } from '@/lib/games/connect4';
import { winnerOf } from '@/lib/games/tictactoe';
import { HOME, TOKENS, absoluteSquare } from '@/lib/games/ludo';

export interface BoardProps {
  game: Game;
  /** Seat of the viewer, or null when only watching. */
  seat: number | null;
  /** True when it is the viewer's turn and the game is running. */
  myTurn: boolean;
  onMove: (move: Record<string, unknown>) => void;
  busy: boolean;
}

const SEAT_COLORS = ['#f97316', '#22d3ee', '#a78bfa', '#4ade80'];

export function seatColor(game: Game, seat: number): string {
  return game.players[seat]?.color ?? SEAT_COLORS[seat % SEAT_COLORS.length];
}

/* --------------------------------------------------------- tic-tac-toe */

export function TicTacToeBoard({ game, myTurn, onMove, busy }: BoardProps) {
  if (game.board.kind !== 'tictactoe') return null;
  const { cells } = game.board;
  const win = winnerOf(cells);

  return (
    <div className="mx-auto grid w-full max-w-[280px] grid-cols-3 gap-1.5">
      {cells.map((cell, i) => {
        const winning = win?.line.includes(i) ?? false;
        return (
          <button
            key={i}
            disabled={!myTurn || cell !== null || busy}
            onClick={() => onMove({ cell: i })}
            aria-label={`Square ${i + 1}`}
            className={`aspect-square rounded-xl border text-3xl font-semibold transition disabled:cursor-not-allowed ${
              winning
                ? 'border-accent bg-accent/20'
                : 'border-ink-700 bg-ink-850 enabled:hover:border-accent enabled:hover:bg-ink-800'
            }`}
            style={{ color: cell !== null ? seatColor(game, cell) : undefined }}
          >
            {cell === null ? '' : cell === 0 ? '✕' : '◯'}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------- connect four */

export function Connect4Board({ game, myTurn, onMove, busy }: BoardProps) {
  if (game.board.kind !== 'connect4') return null;
  const { cells } = game.board;

  return (
    <div className="mx-auto w-full max-w-[340px]">
      <div className="grid grid-cols-7 gap-1 rounded-xl bg-ink-850 p-2">
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const cell = cells[i];
          return (
            <div
              key={i}
              className="aspect-square rounded-full border border-ink-700"
              style={{ background: cell === null ? 'transparent' : seatColor(game, cell) }}
            />
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {Array.from({ length: COLS }, (_, col) => (
          <button
            key={col}
            disabled={!myTurn || busy || cells[col] !== null}
            onClick={() => onMove({ col })}
            aria-label={`Drop in column ${col + 1}`}
            className="rounded-lg border border-ink-700 bg-ink-850 py-1.5 text-xs text-ink-300 transition enabled:hover:border-accent enabled:hover:text-ink-50 disabled:opacity-30"
          >
            ↓
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- chess */

const GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

export function ChessBoardView({ game, seat, myTurn, onMove, busy }: BoardProps) {
  const [from, setFrom] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);

  const board = game.board.kind === 'chess' ? game.board : null;

  // Legal moves come from the same engine the server runs, so the highlights a
  // player sees can never disagree with what the server will accept.
  const legal = useMemo(
    () => (board && myTurn && seat !== null ? legalMoves(board, seat) : []),
    [board, myTurn, seat]
  );

  if (!board) return null;

  // Black sees the board from its own side.
  const order = seat === 1
    ? Array.from({ length: 64 }, (_, i) => 63 - i)
    : Array.from({ length: 64 }, (_, i) => i);

  const targets = from === null ? [] : legal.filter((m) => m.from === from).map((m) => m.to);

  function clickSquare(i: number) {
    if (!myTurn || busy || !board) return;
    if (from !== null && targets.includes(i)) {
      const piece = board.squares[from];
      const lastRank = i < 8 || i >= 56;
      if (piece?.toLowerCase() === 'p' && lastRank) {
        setPromo({ from, to: i });
        return;
      }
      onMove({ from, to: i });
      setFrom(null);
      return;
    }
    const piece = board.squares[i];
    setFrom(piece && colourOf(piece) === seat ? i : null);
  }

  return (
    <div className="mx-auto w-full max-w-[360px]">
      {board.check && (
        <p className="mb-2 text-center text-xs font-medium text-rose-300">Check</p>
      )}
      <div className="grid grid-cols-8 overflow-hidden rounded-xl border border-ink-700">
        {order.map((i) => {
          const r = i >> 3;
          const c = i & 7;
          const dark = (r + c) % 2 === 1;
          const piece = board.squares[i];
          const isTarget = targets.includes(i);
          const isLast = board.lastMove?.includes(i) ?? false;
          return (
            <button
              key={i}
              onClick={() => clickSquare(i)}
              disabled={!myTurn || busy}
              aria-label={squareName(i)}
              className={`relative aspect-square text-2xl leading-none transition sm:text-3xl ${
                dark ? 'bg-ink-800' : 'bg-ink-700/40'
              } ${from === i ? 'ring-2 ring-inset ring-accent' : ''} ${
                isLast ? 'bg-accent/15' : ''
              }`}
            >
              <span className={piece && colourOf(piece) === 0 ? 'text-white' : 'text-ink-950'}>
                {piece ? GLYPHS[piece] : ''}
              </span>
              {isTarget && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="size-2.5 rounded-full bg-accent/70" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {promo && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-3">
          <p className="mb-2 text-xs text-ink-300">Promote to</p>
          <div className="flex gap-2">
            {['q', 'r', 'b', 'n'].map((p) => (
              <button
                key={p}
                onClick={() => {
                  onMove({ from: promo.from, to: promo.to, promo: p });
                  setPromo(null);
                  setFrom(null);
                }}
                className="flex-1 rounded-lg border border-ink-700 bg-ink-900 py-2 text-2xl transition hover:border-accent"
              >
                {GLYPHS[seat === 1 ? p : p.toUpperCase()]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- ludo */

export function LudoBoardView({ game, seat, myTurn, onMove, busy }: BoardProps) {
  if (game.board.kind !== 'ludo') return null;
  const { tokens, dice } = game.board;

  return (
    <div className="mx-auto w-full max-w-[380px]">
      {/* The shared 52-square track, drawn as a strip rather than the classic
          cross — a cross does not survive being shrunk into a chat panel. */}
      <div className="mb-3 flex flex-wrap gap-[3px] rounded-xl border border-ink-700 bg-ink-850 p-2">
        {Array.from({ length: 52 }, (_, square) => {
          const here: number[] = [];
          tokens.forEach((row, s) =>
            row.forEach((p) => {
              if (absoluteSquare(s, p) === square) here.push(s);
            })
          );
          return (
            <div
              key={square}
              title={`Square ${square}`}
              className="grid size-[15px] place-items-center rounded-[3px] border border-ink-700/60 text-[9px]"
              style={{ background: here.length ? seatColor(game, here[0]) : 'transparent' }}
            >
              {here.length > 1 ? here.length : ''}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {tokens.map((row, s) => (
          <div
            key={s}
            className={`rounded-xl border p-2 ${
              game.turn === s ? 'border-accent bg-accent/5' : 'border-ink-700 bg-ink-850'
            }`}
          >
            <div className="mb-1.5 flex items-center gap-2 text-xs">
              <span className="size-2.5 rounded-full" style={{ background: seatColor(game, s) }} />
              <span className="font-medium">{game.players[s]?.name ?? `Seat ${s + 1}`}</span>
              {s === seat && <span className="text-ink-400">(you)</span>}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {row.map((progress, t) => {
                const canPick = myTurn && s === seat && dice !== null && !busy;
                const label =
                  progress === -1 ? 'yard' : progress === HOME ? 'home' : `${progress}`;
                return (
                  <button
                    key={t}
                    disabled={!canPick}
                    onClick={() => onMove({ action: 'move', token: t })}
                    className={`rounded-lg border px-1 py-1.5 text-[11px] transition ${
                      progress === HOME
                        ? 'border-accent/60 bg-accent/15 text-accent'
                        : 'border-ink-700 bg-ink-900 text-ink-300'
                    } enabled:hover:border-accent disabled:opacity-60`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {myTurn && (
        <button
          disabled={dice !== null || busy}
          onClick={() => onMove({ action: 'roll' })}
          className="mt-3 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-soft disabled:opacity-40"
        >
          {dice === null ? 'Roll the dice' : `You rolled ${dice} — pick a token`}
        </button>
      )}
      {TOKENS !== 4 && null}
    </div>
  );
}

/* ---------------------------------------------------------------- race */

export function RaceBoardView({ game, seat, myTurn, onMove, busy }: BoardProps) {
  if (game.board.kind !== 'race') return null;
  const { cars, length, lastRoll } = game.board;

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="space-y-2.5">
        {cars.map((car, s) => {
          const pct = Math.min(100, (car.pos / length) * 100);
          return (
            <div key={s}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: seatColor(game, s) }} />
                  <span className="font-medium">{game.players[s]?.name ?? `Seat ${s + 1}`}</span>
                  {s === seat && <span className="text-ink-400">(you)</span>}
                  {car.stalled && <span className="text-rose-300">spun out</span>}
                </span>
                <span className="text-ink-400">
                  {car.pos}/{length}
                  {lastRoll[s] !== null && ` · rolled ${lastRoll[s]}`}
                </span>
              </div>
              <div className="relative h-6 overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: seatColor(game, s), opacity: 0.35 }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 text-sm transition-all duration-500"
                  style={{ left: `calc(${pct}% - 10px)` }}
                >
                  🏎️
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {myTurn && (
        <div className="mt-3 flex gap-2">
          <button
            disabled={busy}
            onClick={() => onMove({ action: 'coast' })}
            className="flex-1 rounded-xl border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm transition hover:border-accent disabled:opacity-40"
          >
            Coast <span className="text-ink-400">(+3, safe)</span>
          </button>
          <button
            disabled={busy}
            onClick={() => onMove({ action: 'push' })}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-soft disabled:opacity-40"
          >
            Push <span className="opacity-80">(d6, 1 spins)</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function BoardFor(props: BoardProps) {
  switch (props.game.board.kind) {
    case 'tictactoe': return <TicTacToeBoard {...props} />;
    case 'connect4': return <Connect4Board {...props} />;
    case 'chess': return <ChessBoardView {...props} />;
    case 'ludo': return <LudoBoardView {...props} />;
    case 'race': return <RaceBoardView {...props} />;
  }
}
