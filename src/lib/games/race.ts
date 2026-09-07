import type { ApplyResult, Board, Game, GameEngine, Move } from './types';
import { intField } from './types';

/**
 * A turn-based drag race.
 *
 * This is the honest version of "a racing game in a chat room". Real-time
 * racing cannot work over this transport: every position update would be a
 * Redis stream write fanned out over SSE, against a stream capped at 500
 * entries and a cost model that assumes a few thousand commands per client per
 * day. Thirty updates a second would exhaust both immediately.
 *
 * So the racing happens in the decision instead of the reflex. Each turn a
 * driver chooses to COAST for a guaranteed 3, or to PUSH: a d6, where a 1
 * spins you out and costs your next turn. Trailing cars get a slipstream
 * bonus, which keeps a bad opening roll from deciding the whole race.
 */

export const TRACK_LENGTH = 40;
export const COAST_STEP = 3;
/** Cars this far behind the leader draw along in the slipstream. */
export const SLIPSTREAM_GAP = 6;
export const SLIPSTREAM_BONUS = 1;

export const race: GameEngine = {
  kind: 'race',
  label: 'Drag Race',
  blurb: 'Coast for a safe 3, or push your luck on the dice.',
  icon: '🏎️',
  minSeats: 2,
  maxSeats: 4,

  createBoard(seats: number): Board {
    return {
      kind: 'race',
      cars: Array.from({ length: seats }, () => ({ pos: 0, stalled: false })),
      length: TRACK_LENGTH,
      lastRoll: Array(seats).fill(null),
    };
  },

  apply(game: Game, seat: number, move: Move): ApplyResult {
    if (game.board.kind !== 'race') return { ok: false, error: 'Wrong board' };
    const board = game.board;
    const action = move.action;
    if (action !== 'coast' && action !== 'push') {
      return { ok: false, error: 'Choose to coast or to push' };
    }

    const cars = board.cars.map((c) => ({ ...c }));
    const lastRoll = board.lastRoll.slice();
    const name = game.players[seat]?.name ?? 'Someone';
    const nextSeat = (s: number) => (s + 1) % game.seats;

    // Spun out last turn: this turn is spent recovering.
    if (cars[seat].stalled) {
      cars[seat].stalled = false;
      lastRoll[seat] = null;
      return {
        ok: true,
        game: {
          ...game,
          board: { ...board, cars, lastRoll },
          turn: nextSeat(seat),
          note: `${name} is recovering from a spin`,
        },
      };
    }

    const leader = Math.max(...cars.map((c) => c.pos));
    const slipstream = leader - cars[seat].pos >= SLIPSTREAM_GAP ? SLIPSTREAM_BONUS : 0;

    let gained: number;
    let note: string;

    if (action === 'coast') {
      gained = COAST_STEP + slipstream;
      lastRoll[seat] = null;
      note = `${name} coasted ${gained}`;
    } else {
      // The route rolls, so the engine stays pure.
      const dice = intField(move, 'dice', 1, 6);
      if (dice === null) return { ok: false, error: 'Bad roll' };
      lastRoll[seat] = dice;
      if (dice === 1) {
        cars[seat].stalled = true;
        gained = 0;
        note = `${name} pushed too hard and span out`;
      } else {
        gained = dice + slipstream;
        note = `${name} pushed and gained ${gained}`;
      }
    }

    if (slipstream > 0 && gained > 0) note += ' (slipstream +1)';
    cars[seat].pos = Math.min(board.length, cars[seat].pos + gained);

    const won = cars[seat].pos >= board.length;
    if (won) note = `${name} takes the chequered flag`;

    return {
      ok: true,
      game: {
        ...game,
        board: { ...board, cars, lastRoll },
        turn: won ? game.turn : nextSeat(seat),
        status: won ? 'over' : 'active',
        winner: won ? seat : null,
        note,
      },
    };
  },
};
