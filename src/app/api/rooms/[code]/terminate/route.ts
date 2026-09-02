import { getRoom, terminateRoom } from '@/lib/room';
import { readSession, clearSessionCookie } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { json, fail, handleRouteError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/rooms/:code/terminate — host only.
 *
 * This is the destructive one, and it is irreversible by design: it announces
 * the end on the stream, then puts a short TTL on every key belonging to the
 * room. Seconds later the transcript, the roster and every DM inside it stop
 * existing. There is no archive and no undo.
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);

    const self = await readSession(code);
    if (!self) return fail('Join the room first', 401);

    const room = await getRoom(code);
    if (!room) return json({ ok: true, alreadyGone: true });

    if (room.hostId !== self.uid) {
      return fail('Only the person who opened this room can end it', 403);
    }

    await terminateRoom(code, self.name);
    await clearSessionCookie(code);
    return json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
