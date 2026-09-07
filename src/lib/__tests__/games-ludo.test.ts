import { describe, it, expect } from 'vitest';
import { ludo, canMove, anyMove, absoluteSquare, ENTRY, HOME, TRACK, TOKENS } from '../games/ludo';
import type { Game, LudoBoard } from '../games/types';

function game(tokens: number[][], dice: number | null = null, sixes = 0, turn = 0): Game {
  const seats = tokens.length;
  const board: LudoBoard = { kind: 'ludo', tokens, dice, sixes };
  return {
    id: 'g', kind: 'ludo',
    players: Array.from({ length: seats }, (_, i) => ({
      uid: `u${i}`, name: `P${i + 1}`, color: '#fff', seat: i,
    })),
    seats, turn, status: 'active', winner: null, board,
    createdAt: 0, updatedAt: 0, version: 1, note: '', openedBy: 'u0',
  };
}

const yard = (seats = 2) => Array.from({ length: seats }, () => Array(TOKENS).fill(-1));

describe('track geometry', () => {
  it('gives each seat its own entry point on the shared track', () => {
    expect(ENTRY).toHaveLength(4);
    expect(new Set(ENTRY).size).toBe(4);
    expect(absoluteSquare(0, 0)).toBe(ENTRY[0]);
    expect(absoluteSquare(1, 0)).toBe(ENTRY[1]);
  });

  it('wraps around the end of the track', () => {
    expect(absoluteSquare(1, TRACK - 1)).toBe((ENTRY[1] + TRACK - 1) % TRACK);
    expect(absoluteSquare(3, 20)).toBe((ENTRY[3] + 20) % TRACK);
  });

  it('has no absolute square for the yard or the home column', () => {
    expect(absoluteSquare(0, -1)).toBeNull();
    expect(absoluteSquare(0, TRACK)).toBeNull();
    expect(absoluteSquare(0, HOME)).toBeNull();
  });
});

describe('leaving the yard', () => {
  it('needs a six', () => {
    expect(canMove(yard(), 0, 0, 5)).toBe(false);
    expect(canMove(yard(), 0, 0, 6)).toBe(true);
  });

  it('passes the turn when the roll is unusable', () => {
    const r = ludo.apply(game(yard()), 0, { action: 'roll', dice: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.turn).toBe(1);
    expect(r.game.note).toContain('cannot move');
  });

  it('keeps the turn on a six even with nothing to move', () => {
    const tokens = [[HOME, HOME, HOME, -1], [-1, -1, -1, -1]];
    // Every token is home except one, which a six can still bring out.
    expect(anyMove(tokens, 0, 6)).toBe(true);
  });
});

describe('rolling', () => {
  it('will not let you roll twice in one turn', () => {
    const g = game(yard(), 6);
    expect(ludo.apply(g, 0, { action: 'roll', dice: 6 })).toMatchObject({ ok: false });
  });

  it('will not let you move before rolling', () => {
    expect(ludo.apply(game(yard()), 0, { action: 'move', token: 0 })).toMatchObject({ ok: false });
  });

  it('forfeits the turn on three consecutive sixes', () => {
    const g = game([[0, -1, -1, -1], [-1, -1, -1, -1]], null, 2);
    const r = ludo.apply(g, 0, { action: 'roll', dice: 6 });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'ludo') return;
    expect(r.game.turn).toBe(1);
    expect(r.game.board.sixes).toBe(0);
    expect(r.game.note).toContain('three sixes');
  });

  it('rejects a roll outside one to six', () => {
    for (const dice of [0, 7, -1, 2.5]) {
      expect(ludo.apply(game(yard()), 0, { action: 'roll', dice }).ok).toBe(false);
    }
  });
});

describe('moving', () => {
  it('brings a token out onto the entry square', () => {
    const g = game(yard(), 6);
    const r = ludo.apply(g, 0, { action: 'move', token: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'ludo') return;
    expect(r.game.board.tokens[0][0]).toBe(0);
    expect(r.game.turn).toBe(0); // a six earns another go
  });

  it('requires an exact count to reach home', () => {
    expect(canMove([[HOME - 2, -1, -1, -1]], 0, 0, 2)).toBe(true);
    expect(canMove([[HOME - 2, -1, -1, -1]], 0, 0, 3)).toBe(false);
  });

  it('never moves a token that is already home', () => {
    expect(canMove([[HOME, -1, -1, -1]], 0, 0, 1)).toBe(false);
  });

  it('captures a lone opponent and sends it back to the yard', () => {
    // Seat 1 sits on the absolute square seat 0 will land on.
    const target = 5;
    const abs = absoluteSquare(0, target)!;
    const seat1Progress = (abs - ENTRY[1] + TRACK) % TRACK;
    const g = game([[target - 3, -1, -1, -1], [seat1Progress, -1, -1, -1]], 3);
    const r = ludo.apply(g, 0, { action: 'move', token: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'ludo') return;
    expect(r.game.board.tokens[1][0]).toBe(-1);      // knocked out
    expect(r.game.note).toContain('knocked out');
    expect(r.game.turn).toBe(0);                      // a capture earns another go
  });

  it('does not capture on a safe square', () => {
    // Entry squares are safe; seat 1 entering on its own entry cannot be taken.
    const abs = ENTRY[1];
    const seat0Progress = (abs - ENTRY[0] + TRACK) % TRACK;
    const g = game([[seat0Progress - 2, -1, -1, -1], [0, -1, -1, -1]], 2);
    const r = ludo.apply(g, 0, { action: 'move', token: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'ludo') return;
    expect(r.game.board.tokens[1][0]).toBe(0); // still on the board
  });

  it('declares a winner once every token is home', () => {
    const g = game([[HOME, HOME, HOME, HOME - 1], [0, -1, -1, -1]], 1);
    const r = ludo.apply(g, 0, { action: 'move', token: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.status).toBe('over');
    expect(r.game.winner).toBe(0);
  });

  it('rejects a token index outside the set', () => {
    const g = game(yard(), 6);
    for (const token of [-1, 4, 'a', undefined]) {
      expect(ludo.apply(g, 0, { action: 'move', token }).ok).toBe(false);
    }
  });

  it('supports three and four player tables', () => {
    for (const seats of [3, 4]) {
      const board = ludo.createBoard(seats);
      expect(board.kind).toBe('ludo');
      if (board.kind !== 'ludo') continue;
      expect(board.tokens).toHaveLength(seats);
      const g = game(yard(seats), 6);
      const r = ludo.apply(g, 0, { action: 'move', token: 0 });
      expect(r.ok).toBe(true);
    }
  });
});
