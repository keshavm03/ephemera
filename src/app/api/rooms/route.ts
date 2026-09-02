import { createRoom, appendMessage, upsertMember } from '@/lib/room';
import { ROOM_TTL_SECONDS } from '@/lib/keys';
import { randomRoomCode, randomId, randomColor, sanitizeName } from '@/lib/names';
import { setSessionCookie } from '@/lib/session';
import { json, fail, readJson, handleRouteError } from '@/lib/api';
import { allow } from '@/lib/ratelimit';
import { getRoom } from '@/lib/room';
import type { RoomMeta, SessionClaims } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rooms — mint a fresh room and make the caller its host. */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    if (!(await allow(`create:${ip}`, 10, 60))) {
      return fail('Too many rooms created. Wait a minute.', 429);
    }

    const body = await readJson(req);
    const name = sanitizeName(body.name);
    const rawTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 48) : '';
    const title = rawTitle || 'Untitled room';

    // Collisions are vanishingly rare, but a taken code would silently drop
    // someone into a stranger's conversation — so retry rather than trust luck.
    let code = randomRoomCode();
    for (let i = 0; i < 5 && (await getRoom(code)); i++) code = randomRoomCode();
    if (await getRoom(code)) return fail('Could not allocate a room code', 503);

    const uid = randomId();
    const color = randomColor();
    const now = Date.now();

    const meta: RoomMeta = { code, title, hostId: uid, createdAt: now, ttl: ROOM_TTL_SECONDS };
    await createRoom(meta);
    await upsertMember(code, { uid, name, color, joinedAt: now, lastSeen: now });
    await appendMessage(code, {
      channel: 'room',
      kind: 'system',
      from: 'system',
      fromName: 'system',
      fromColor: '#94a3b8',
      body: `${name} opened the room`,
    });

    const claims: SessionClaims = {
      uid,
      name,
      color,
      room: code,
      host: true,
      exp: now + ROOM_TTL_SECONDS * 1000,
    };
    await setSessionCookie(code, claims);

    return json({ code, title, self: claims });
  } catch (err) {
    return handleRouteError(err);
  }
}
