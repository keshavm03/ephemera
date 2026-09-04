import { getRoom, upsertMember, appendMessage, getMember } from '@/lib/room';
import { ROOM_TTL_SECONDS } from '@/lib/keys';
import { randomId, randomColor, sanitizeName } from '@/lib/names';
import { setSessionCookie, readSession } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { json, fail, readJson, handleRouteError } from '@/lib/api';
import { allow } from '@/lib/ratelimit';
import type { SessionClaims } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/rooms/:code/join — no password, no account. You pick a throwaway
 * name and get a room-scoped signed cookie back.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    if (!(await allow(`join:${ip}`, 30, 60))) return fail('Too many join attempts', 429);

    const room = await getRoom(code);
    if (!room) return fail('This room does not exist, or it has already ended.', 404);

    const body = await readJson(req);
    const name = sanitizeName(body.name);

    // Rejoining from the same browser keeps your uid, so your DM threads and
    // your colour survive a refresh.
    const existing = await readSession(code);
    const uid = existing?.uid ?? randomId();
    const color = existing?.color ?? randomColor();
    const now = Date.now();

    // The roster is ordered by arrival, so a refresh must not restamp
    // joinedAt — doing so shuffles the rejoining person to the bottom of
    // everyone else's sidebar. Fall back to `now` only for a genuine arrival.
    const prior = existing ? await getMember(code, uid) : null;

    await upsertMember(code, {
      uid,
      name,
      color,
      joinedAt: prior?.joinedAt ?? now,
      lastSeen: now,
    });

    if (!existing || existing.name !== name) {
      await appendMessage(code, {
        channel: 'room',
        kind: 'system',
        from: 'system',
        fromName: 'system',
        fromColor: '#94a3b8',
        body: existing ? `${existing.name} is now ${name}` : `${name} joined`,
      });
    }

    const claims: SessionClaims = {
      uid,
      name,
      color,
      room: code,
      host: room.hostId === uid,
      exp: now + ROOM_TTL_SECONDS * 1000,
    };
    await setSessionCookie(code, claims);

    return json({ code, title: room.title, self: claims });
  } catch (err) {
    return handleRouteError(err);
  }
}
