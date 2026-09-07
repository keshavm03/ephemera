import type { ApplyResult, Board, Game, GameEngine, Move } from './types';
import { intField } from './types';

export const COLS = 7;
export const ROWS = 6;

const idx = (row: number, col: number) => row * COLS + col;

/** Lowest empty row in a column, or -1 when the column is full. */
export function dropRow(cells: (number | null)[], col: number): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (cells[idx(row, col)] === null) return row;
  }
  return -1;
}

/**
 * Four in a row through (row, col). Only the last-played cell can complete a
 * line, so checking outward from it is both correct and much cheaper than
 * scanning the whole grid after every move.
 */
export function winningLine(
  cells: (number | null)[],
  row: number,
  col: number
): number[] | null {
  const seat = cells[idx(row, col)];
  if (seat === null) return null;

  const directions = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // down-right
    [1, -1], // down-left
  ];

  for (const [dr, dc] of directions) {
    const line = [idx(row, col)];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && cells[idx(r, c)] === seat) {
        line.push(idx(r, c));
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

export const connect4: GameEngine = {
  kind: 'connect4',
  label: 'Connect Four',
  blurb: 'Drop discs, get four in a line before they do.',
  icon: '🔴',
  minSeats: 2,
  maxSeats: 2,

  createBoard(): Board {
    return { kind: 'connect4', cells: Array(ROWS * COLS).fill(null) };
  },

  apply(game: Game, seat: number, move: Move): ApplyResult {
    if (game.board.kind !== 'connect4') return { ok: false, error: 'Wrong board' };
    const col = intField(move, 'col', 0, COLS - 1);
    if (col === null) return { ok: false, error: 'Pick a column' };

    const cells = game.board.cells.slice();
    const row = dropRow(cells, col);
    if (row === -1) return { ok: false, error: 'That column is full' };

    cells[idx(row, col)] = seat;

    const line = winningLine(cells, row, col);
    const full = cells.every((c) => c !== null);
    const name = game.players[seat]?.name ?? 'Someone';

    return {
      ok: true,
      game: {
        ...game,
        board: { kind: 'connect4', cells },
        turn: line || full ? game.turn : 1 - seat,
        status: line || full ? 'over' : 'active',
        winner: line ? seat : null,
        note: line ? `${name} connected four` : full ? 'Draw — the grid is full' : `${name} played column ${col + 1}`,
      },
    };
  },
};
