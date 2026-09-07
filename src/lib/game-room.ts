import { redis } from './redis';
import { K, ROOM_TTL_SECONDS } from './keys';
import { appendMessage, touchRoom } from './room';
import type { Game } from './games/types';

/**
 * Storage and fan-out for the room's single active game.
 *
 * The game lives in one key as JSON — it is read and written whole, so there is
 * no partial-update window for a board to be seen half-moved. Every change is
 * also appended to the message stream, which is what actually delivers it: the
 * SSE route recognises the `game` kind and forwards board state to every
 * connected client over the connection chat already uses.
 */

export async function getGame(code: string): Promise<Game | null> {
  const raw = await redis().get<string | Game>(K.game(code));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as Game) : raw;
  } catch {
    // A corrupt game must not make the room unusable.
    return null;
  }
}

export async function saveGame(code: string, game: Game): Promise<void> {
  await redis().set(K.game(code), JSON.stringify(game), { ex: ROOM_TTL_SECONDS });
  await touchRoom(code);
}

export async function clearGame(code: string): Promise<void> {
  await redis().del(K.game(code));
}

/**
 * Pushes the current game to everyone in the room.
 *
 * `null` is a real value here — it is how clients are told the table closed,
 * and it is why the body is JSON rather than an id.
 */
export async function broadcastGame(code: string, game: Game | null): Promise<void> {
  await appendMessage(code, {
    channel: 'room',
    kind: 'game',
    from: 'system',
    fromName: 'system',
    fromColor: '#94a3b8',
    body: JSON.stringify(game),
  });
}

/** A fair d6. Rolled on the server so a client cannot choose its own luck. */
export function rollDie(): number {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  // 252 is the largest multiple of 6 below 256; rejecting above it keeps every
  // face equally likely instead of biasing 1-4.
  return bytes[0] >= 252 ? rollDie() : (bytes[0] % 6) + 1;
}
