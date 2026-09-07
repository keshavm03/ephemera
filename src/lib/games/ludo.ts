import type { ApplyResult, Board, Game, GameEngine, LudoBoard, Move } from './types';
import { intField } from './types';

/**
 * Ludo for two to four players.
 *
 * Tokens store *progress travelled* (see LudoBoard) rather than an absolute
 * square. Each seat enters the shared 52-square track at its own offset, so
 * the absolute square is `(entry + progress) % 52`. Comparing absolute squares
 * is what makes captures work between players whose progress counters differ.
 *
 * Implemented rules: a six is needed to leave the yard, a six earns another
 * roll, three sixes in a row forfeit the turn, landing on a lone opponent
 * sends it back to the yard, star squares are safe, and the home column must
 * be entered by exact count.
 */

export const TRACK = 52;
export const HOME = 57; // 52 track squares + 5 home-column steps
export const TOKENS = 4;

/** Where each seat joins the shared track. */
export const ENTRY = [0, 13, 26, 39];

/** Squares nobody can be captured on. Entry squares plus the four stars. */
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function absoluteSquare(seat: number, progress: number): number | null {
  if (progress < 0 || progress >= TRACK) return null; // yard or home column
  return (ENTRY[seat] + progress) % TRACK;
}

/** Can this token legally move `dice` steps? */
export function canMove(tokens: number[][], seat: number, token: number, dice: number): boolean {
  const progress = tokens[seat][token];
  if (progress === HOME) return false;
  if (progress === -1) return dice === 6;
  // The home column must be entered exactly; overshooting is not allowed.
  return progress + dice <= HOME;
}

export function anyMove(tokens: number[][], seat: number, dice: number): boolean {
  return tokens[seat].some((_, i) => canMove(tokens, seat, i, dice));
}

export const ludo: GameEngine = {
  kind: 'ludo',
  label: 'Ludo',
  blurb: 'Two to four players. Sixes, captures, and betrayal.',
  icon: '🎲',
  minSeats: 2,
  maxSeats: 4,

  createBoard(seats: number): Board {
    return {
      kind: 'ludo',
      tokens: Array.from({ length: seats }, () => Array(TOKENS).fill(-1)),
      dice: null,
      sixes: 0,
    };
  },

  apply(game: Game, seat: number, move: Move): ApplyResult {
    if (game.board.kind !== 'ludo') return { ok: false, error: 'Wrong board' };
    const board = game.board;
    const action = move.action;
    const name = game.players[seat]?.name ?? 'Someone';
    const nextSeat = (s: number) => (s + 1) % game.seats;

    /* ------------------------------------------------------------- roll */
    if (action === 'roll') {
      if (board.dice !== null) return { ok: false, error: 'You have already rolled — now move' };
      // The route supplies the roll so the engine stays pure and testable.
      const dice = intField(move, 'dice', 1, 6);
      if (dice === null) return { ok: false, error: 'Bad roll' };

      const sixes = dice === 6 ? board.sixes + 1 : 0;

      // Three sixes in a row and the turn is forfeit.
      if (sixes === 3) {
        return {
          ok: true,
          game: {
            ...game,
            board: { ...board, dice: null, sixes: 0 },
            turn: nextSeat(seat),
            note: `${name} rolled three sixes and forfeits the turn`,
          },
        };
      }

      // Nothing legal to do with this number — pass straight on.
      if (!anyMove(board.tokens, seat, dice)) {
        return {
          ok: true,
          game: {
            ...game,
            board: { ...board, dice: null, sixes: 0 },
            turn: dice === 6 ? seat : nextSeat(seat),
            note: `${name} rolled ${dice} and cannot move`,
          },
        };
      }

      return {
        ok: true,
        game: {
          ...game,
          board: { ...board, dice, sixes },
          note: `${name} rolled ${dice}`,
        },
      };
    }

    /* ------------------------------------------------------------- move */
    if (action !== 'move') return { ok: false, error: 'Roll first' };
    if (board.dice === null) return { ok: false, error: 'Roll the dice first' };

    const token = intField(move, 'token', 0, TOKENS - 1);
    if (token === null) return { ok: false, error: 'Pick a token' };
    if (!canMove(board.tokens, seat, token, board.dice)) {
      return { ok: false, error: 'That token cannot make that move' };
    }

    const dice = board.dice;
    const tokens = board.tokens.map((row) => row.slice());
    const from = tokens[seat][token];
    const to = from === -1 ? 0 : from + dice;
    tokens[seat][token] = to;

    // Capture: a lone opponent on the same track square goes back to the yard.
    let captured: string | null = null;
    const landing = absoluteSquare(seat, to);
    if (landing !== null && !SAFE.has(landing)) {
      for (let other = 0; other < tokens.length; other++) {
        if (other === seat) continue;
        for (let t = 0; t < TOKENS; t++) {
          if (absoluteSquare(other, tokens[other][t]) === landing) {
            tokens[other][t] = -1;
            captured = game.players[other]?.name ?? 'someone';
          }
        }
      }
    }

    const finished = tokens[seat].every((p) => p === HOME);
    // A six, a capture or getting a token home all earn another roll.
    const extraTurn = dice === 6 || captured !== null || to === HOME;

    let note = `${name} moved a token`;
    if (from === -1) note = `${name} brought a token out`;
    else if (to === HOME) note = `${name} got a token home`;
    if (captured) note += ` and knocked out ${captured}`;
    if (finished) note = `${name} got every token home and wins`;

    return {
      ok: true,
      game: {
        ...game,
        board: { ...board, tokens, dice: null, sixes: dice === 6 ? board.sixes : 0 },
        turn: finished || extraTurn ? seat : nextSeat(seat),
        status: finished ? 'over' : 'active',
        winner: finished ? seat : null,
        note,
      } satisfies Game as Game,
    };
  },
};

export type { LudoBoard };
