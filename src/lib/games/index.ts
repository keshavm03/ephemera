import type { GameEngine, GameKind } from './types';
import { ticTacToe } from './tictactoe';
import { connect4 } from './connect4';
import { chess } from './chess';
import { ludo } from './ludo';
import { race } from './race';

export const ENGINES: Record<GameKind, GameEngine> = {
  tictactoe: ticTacToe,
  connect4,
  chess,
  ludo,
  race,
};

/** Lobby order — quickest to learn first. */
export const GAME_ORDER: GameKind[] = ['tictactoe', 'connect4', 'race', 'ludo', 'chess'];

/**
 * Resolves a client-supplied kind.
 *
 * `Object.hasOwn` rather than a plain lookup: `ENGINES['constructor']` walks
 * the prototype chain and hands back `Object`, which is truthy, so the route
 * would sail past its "unknown game" check and then throw on `createBoard`.
 * Any inherited key — constructor, toString, __proto__ — has to miss.
 */
export function engineFor(kind: unknown): GameEngine | null {
  if (typeof kind !== 'string') return null;
  if (!Object.hasOwn(ENGINES, kind)) return null;
  return (ENGINES as Record<string, GameEngine>)[kind];
}

export * from './types';
