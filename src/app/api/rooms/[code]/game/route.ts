import { getRoom, listMembers } from '@/lib/room';
import { getGame, saveGame, clearGame, broadcastGame, rollDie } from '@/lib/game-room';
import { engineFor, ENGINES } from '@/lib/games';
import type { Game, GamePlayer } from '@/lib/games/types';
import { readSession } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { json, fail, readJson, handleRouteError } from '@/lib/api';
import { allow } from '@/lib/ratelimit';
import { randomId } from '@/lib/names';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/** GET — the current game, for a client that just connected. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);
    const self = await readSession(code);
    if (!self) return fail('Join the room first', 401);

    // A session cookie outlives the room it was minted for, so without this the
    // board stayed readable to former players after the host destroyed the
    // room. Every other route already gates on the room existing; this one did
    // not, which made it the way back in to a deleted table.
    if (!(await getRoom(code))) return fail('This room has ended', 410);

    return json({ game: await getGame(code) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * POST — { action: 'open' | 'sit' | 'move' | 'resign' | 'close', ... }
 *
 * Every rule decision is delegated to the engine, which is pure. This route
 * owns only the things an engine must not see: who you are, whose turn it is,
 * and the dice — rolled here so a client cannot pick its own numbers.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);

    const self = await readSession(code);
    if (!self) return fail('Join the room first', 401);
    if (!(await getRoom(code))) return fail('This room has ended', 410);

    if (!(await allow(`game:${code}:${self.uid}`, 60, 10))) {
      return fail('Slow down', 429);
    }

    const body = await readJson(req);
    const action = body.action;
    const current = await getGame(code);

    /* ------------------------------------------------------------- open */
    if (action === 'open') {
      if (current && current.status !== 'over') {
        return fail('A game is already running in this room', 409);
      }
      const engine = engineFor(body.kind);
      if (!engine) return fail('Unknown game', 400);

      const wanted = Number(body.seats);
      const seats = Number.isInteger(wanted)
        ? Math.min(engine.maxSeats, Math.max(engine.minSeats, wanted))
        : engine.minSeats;

      const now = Date.now();
      const game: Game = {
        id: randomId(8),
        kind: engine.kind,
        players: [{ uid: self.uid, name: self.name, color: self.color, seat: 0 }],
        seats,
        turn: 0,
        status: 'waiting',
        winner: null,
        board: engine.createBoard(seats),
        createdAt: now,
        updatedAt: now,
        version: 1,
        note: `${self.name} opened ${engine.label} — waiting for players`,
        openedBy: self.uid,
      };
      await saveGame(code, game);
      await broadcastGame(code, game);
      return json({ game });
    }

    if (!current) return fail('No game is running', 404);

    /* -------------------------------------------------------------- sit */
    if (action === 'sit') {
      if (current.status !== 'waiting') return fail('That game has already started', 409);
      if (current.players.some((p) => p.uid === self.uid)) {
        return fail('You are already at this table', 409);
      }
      if (current.players.length >= current.seats) return fail('The table is full', 409);

      // Anyone who wandered off should not hold a seat.
      const members = await listMembers(code);
      if (!members.some((m) => m.uid === self.uid)) return fail('Rejoin the room first', 409);

      const players: GamePlayer[] = [
        ...current.players,
        { uid: self.uid, name: self.name, color: self.color, seat: current.players.length },
      ];
      const full = players.length === current.seats;
      const engine = ENGINES[current.kind];

      const game: Game = {
        ...current,
        players,
        status: full ? 'active' : 'waiting',
        version: current.version + 1,
        updatedAt: Date.now(),
        note: full
          ? `${engine.label} begins — ${players[0].name} to play`
          : `${self.name} sat down (${players.length}/${current.seats})`,
      };
      await saveGame(code, game);
      await broadcastGame(code, game);
      return json({ game });
    }

    const seat = current.players.find((p) => p.uid === self.uid)?.seat;

    /* ------------------------------------------------------------ close */
    if (action === 'close') {
      const room = await getRoom(code);
      if (current.openedBy !== self.uid && room?.hostId !== self.uid) {
        return fail('Only whoever opened the table can close it', 403);
      }
      await clearGame(code);
      await broadcastGame(code, null);
      return json({ game: null });
    }

    /* ----------------------------------------------------------- resign */
    if (action === 'resign') {
      if (seat === undefined) return fail('You are not playing', 403);
      if (current.status !== 'active') return fail('That game is not running', 409);

      // With two players resigning hands the win over; with more it is a
      // withdrawal, so nobody is declared the winner.
      const winner = current.seats === 2 ? 1 - seat : null;
      const game: Game = {
        ...current,
        status: 'over',
        winner,
        version: current.version + 1,
        updatedAt: Date.now(),
        note: `${self.name} resigned`,
      };
      await saveGame(code, game);
      await broadcastGame(code, game);
      return json({ game });
    }

    /* ------------------------------------------------------------- move */
    if (action !== 'move') return fail('Unknown action', 400);
    if (seat === undefined) return fail('You are not playing this game', 403);
    if (current.status !== 'active') {
      return fail(current.status === 'waiting' ? 'Waiting for players' : 'That game is over', 409);
    }
    if (current.turn !== seat) return fail('It is not your turn', 409);

    // A retried or double-clicked request carries a stale version and is
    // rejected rather than applied twice.
    if (typeof body.version === 'number' && body.version !== current.version) {
      return fail('That move was already played', 409);
    }

    const engine = ENGINES[current.kind];
    const move = (body.move && typeof body.move === 'object' ? body.move : {}) as Record<
      string,
      unknown
    >;

    // Dice are the server's to decide, never the client's.
    if (move.action === 'roll' || (current.kind === 'race' && move.action === 'push')) {
      move.dice = rollDie();
    }

    const result = engine.apply(current, seat, move);
    if (!result.ok) return fail(result.error, 400);

    const game: Game = {
      ...result.game,
      version: current.version + 1,
      updatedAt: Date.now(),
    };
    await saveGame(code, game);
    await broadcastGame(code, game);
    return json({ game });
  } catch (err) {
    return handleRouteError(err);
  }
}
