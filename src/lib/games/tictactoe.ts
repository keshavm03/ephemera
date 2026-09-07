import type { ApplyResult, Board, Game, GameEngine, Move } from './types';
import { intField } from './types';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];

/** Returns the winning seat and its line, or null. */
export function winnerOf(cells: (number | null)[]): { seat: number; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (cells[a] !== null && cells[a] === cells[b] && cells[b] === cells[c]) {
      return { seat: cells[a] as number, line };
    }
  }
  return null;
}

export const ticTacToe: GameEngine = {
  kind: 'tictactoe',
  label: 'Tic-tac-toe',
  blurb: 'Three in a row. Ninety seconds, settled.',
  icon: '⭕',
  minSeats: 2,
  maxSeats: 2,

  createBoard(): Board {
    return { kind: 'tictactoe', cells: Array(9).fill(null) };
  },

  apply(game: Game, seat: number, move: Move): ApplyResult {
    if (game.board.kind !== 'tictactoe') return { ok: false, error: 'Wrong board' };
    const cell = intField(move, 'cell', 0, 8);
    if (cell === null) return { ok: false, error: 'Pick a square' };
    if (game.board.cells[cell] !== null) return { ok: false, error: 'That square is taken' };

    const cells = game.board.cells.slice();
    cells[cell] = seat;

    const win = winnerOf(cells);
    const full = cells.every((c) => c !== null);
    const name = game.players[seat]?.name ?? 'Someone';

    return {
      ok: true,
      game: {
        ...game,
        board: { kind: 'tictactoe', cells },
        turn: win || full ? game.turn : 1 - seat,
        status: win || full ? 'over' : 'active',
        winner: win ? win.seat : null,
        note: win ? `${name} won` : full ? 'Draw — nobody wins' : `${name} played`,
      },
    };
  },
};
