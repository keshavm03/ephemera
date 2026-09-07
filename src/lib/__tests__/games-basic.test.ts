import { describe, it, expect } from 'vitest';
import { ticTacToe } from '../games/tictactoe';
import { connect4, dropRow, winningLine, COLS, ROWS } from '../games/connect4';
import { race, TRACK_LENGTH, COAST_STEP } from '../games/race';
import { ENGINES, GAME_ORDER, engineFor } from '../games';
import type { Board, Game, GameKind } from '../games/types';

export function makeGame(kind: GameKind, seats = 2, board?: Board): Game {
  const engine = ENGINES[kind];
  return {
    id: 'g1',
    kind,
    players: Array.from({ length: seats }, (_, i) => ({
      uid: `u${i}`, name: `P${i + 1}`, color: '#fff', seat: i,
    })),
    seats,
    turn: 0,
    status: 'active',
    winner: null,
    board: board ?? engine.createBoard(seats),
    createdAt: 0,
    updatedAt: 0,
    version: 1,
    note: '',
    openedBy: 'u0',
  };
}

describe('engine registry', () => {
  it('lists every engine in the lobby order', () => {
    expect([...GAME_ORDER].sort()).toEqual(Object.keys(ENGINES).sort());
  });

  it('resolves a known kind and refuses anything else', () => {
    expect(engineFor('chess')?.kind).toBe('chess');
    expect(engineFor('nope')).toBeNull();
    expect(engineFor(42)).toBeNull();
    // A prototype-pollution style lookup must not resolve to a function.
    expect(engineFor('constructor')).toBeNull();
    expect(engineFor('toString')).toBeNull();
  });

  it('never lets minSeats exceed maxSeats', () => {
    for (const engine of Object.values(ENGINES)) {
      expect(engine.minSeats).toBeLessThanOrEqual(engine.maxSeats);
      expect(engine.minSeats).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('tic-tac-toe', () => {
  it('rejects a square that is already taken', () => {
    const g = makeGame('tictactoe');
    const first = ticTacToe.apply(g, 0, { cell: 4 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(ticTacToe.apply(first.game, 1, { cell: 4 })).toMatchObject({ ok: false });
  });

  it('rejects an out-of-range or missing square', () => {
    const g = makeGame('tictactoe');
    for (const cell of [-1, 9, 1.5, '3', undefined]) {
      expect(ticTacToe.apply(g, 0, { cell }).ok).toBe(false);
    }
  });

  it('alternates turns', () => {
    const g = makeGame('tictactoe');
    const r = ticTacToe.apply(g, 0, { cell: 0 });
    expect(r.ok && r.game.turn).toBe(1);
  });

  it('detects a row, a column and a diagonal', () => {
    const wins: number[][] = [[0, 1, 2], [0, 3, 6], [0, 4, 8]];
    for (const line of wins) {
      const cells = Array(9).fill(null);
      for (const i of line) cells[i] = 0;
      const g = makeGame('tictactoe', 2, { kind: 'tictactoe', cells: cells.slice(0, 8).concat([null]) });
      // Replay the final square properly through the engine.
      const partial = cells.slice();
      partial[line[2]] = null;
      const mid = makeGame('tictactoe', 2, { kind: 'tictactoe', cells: partial });
      const r = ticTacToe.apply(mid, 0, { cell: line[2] });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.game.status).toBe('over');
      expect(r.game.winner).toBe(0);
      void g;
    }
  });

  it('calls a full board a draw with no winner', () => {
    // X O X / X O O / O X X — full, nobody wins.
    const cells = [0, 1, 0, 0, 1, 1, 1, 0, null];
    const g = makeGame('tictactoe', 2, { kind: 'tictactoe', cells });
    const r = ticTacToe.apply(g, 0, { cell: 8 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.status).toBe('over');
    expect(r.game.winner).toBeNull();
  });
});

describe('connect four', () => {
  it('stacks discs from the bottom', () => {
    const g = makeGame('connect4');
    const r = connect4.apply(g, 0, { col: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cells = (r.game.board as { cells: (number | null)[] }).cells;
    expect(cells[(ROWS - 1) * COLS + 3]).toBe(0);
    expect(cells[3]).toBeNull();
  });

  it('refuses a full column', () => {
    let g = makeGame('connect4');
    for (let i = 0; i < ROWS; i++) {
      const r = connect4.apply(g, i % 2, { col: 0 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      g = { ...r.game, status: 'active', winner: null };
    }
    expect(connect4.apply(g, 0, { col: 0 })).toMatchObject({ ok: false });
    expect(dropRow((g.board as { cells: (number | null)[] }).cells, 0)).toBe(-1);
  });

  it('finds a horizontal win', () => {
    const cells: (number | null)[] = Array(ROWS * COLS).fill(null);
    const bottom = (ROWS - 1) * COLS;
    for (const c of [0, 1, 2]) cells[bottom + c] = 0;
    const g = makeGame('connect4', 2, { kind: 'connect4', cells });
    const r = connect4.apply(g, 0, { col: 3 });
    expect(r.ok && r.game.status).toBe('over');
    expect(r.ok && r.game.winner).toBe(0);
  });

  it('finds a diagonal win', () => {
    const cells: (number | null)[] = Array(ROWS * COLS).fill(null);
    const at = (r: number, c: number) => r * COLS + c;
    // Build a staircase so a disc dropped in column 3 lands at row 2.
    cells[at(5, 0)] = 0;
    cells[at(5, 1)] = 1; cells[at(4, 1)] = 0;
    cells[at(5, 2)] = 1; cells[at(4, 2)] = 1; cells[at(3, 2)] = 0;
    cells[at(5, 3)] = 1; cells[at(4, 3)] = 1; cells[at(3, 3)] = 1;
    const g = makeGame('connect4', 2, { kind: 'connect4', cells });
    const r = connect4.apply(g, 0, { col: 3 });
    expect(r.ok && r.game.winner).toBe(0);
    expect(winningLine((r.ok ? r.game.board : g.board) as never, 2, 3)).not.toBeNull();
  });
});

describe('drag race', () => {
  it('coasts a fixed distance', () => {
    const g = makeGame('race');
    const r = race.apply(g, 0, { action: 'coast' });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'race') return;
    expect(r.game.board.cars[0].pos).toBe(COAST_STEP);
    expect(r.game.turn).toBe(1);
  });

  it('spins out on a rolled 1 and loses the next turn', () => {
    const g = makeGame('race');
    const spun = race.apply(g, 0, { action: 'push', dice: 1 });
    expect(spun.ok).toBe(true);
    if (!spun.ok || spun.game.board.kind !== 'race') return;
    expect(spun.game.board.cars[0].stalled).toBe(true);
    expect(spun.game.board.cars[0].pos).toBe(0);

    // The following turn is spent recovering, not moving.
    const recovering = race.apply({ ...spun.game, turn: 0 }, 0, { action: 'coast' });
    expect(recovering.ok).toBe(true);
    if (!recovering.ok || recovering.game.board.kind !== 'race') return;
    expect(recovering.game.board.cars[0].pos).toBe(0);
    expect(recovering.game.board.cars[0].stalled).toBe(false);
  });

  it('gives a trailing car a slipstream bonus', () => {
    const g = makeGame('race');
    if (g.board.kind !== 'race') return;
    g.board.cars[1].pos = 20; // seat 0 is far behind
    const r = race.apply(g, 0, { action: 'coast' });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'race') return;
    expect(r.game.board.cars[0].pos).toBe(COAST_STEP + 1);
  });

  it('ends the race at the finish line', () => {
    const g = makeGame('race');
    if (g.board.kind !== 'race') return;
    g.board.cars[0].pos = TRACK_LENGTH - 1;
    g.board.cars[1].pos = TRACK_LENGTH - 1; // no slipstream
    const r = race.apply(g, 0, { action: 'coast' });
    expect(r.ok && r.game.status).toBe('over');
    expect(r.ok && r.game.winner).toBe(0);
  });

  it('refuses an unknown action', () => {
    expect(race.apply(makeGame('race'), 0, { action: 'teleport' }).ok).toBe(false);
  });
});
