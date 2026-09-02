import { getRoom, appendMessage, listMembers } from '@/lib/room';
import { readSession } from '@/lib/session';
import { normalizeCode, validateMessage } from '@/lib/validate';
import { json, fail, readJson, handleRouteError } from '@/lib/api';
import { allow } from '@/lib/ratelimit';
import { dmChannelId } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/** POST /api/rooms/:code/messages — { kind, body, to? } */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);

    const self = await readSession(code);
    if (!self) return fail('Join the room first', 401);

    if (!(await allow(`msg:${code}:${self.uid}`, 30, 10))) {
      return fail('You are sending messages too quickly', 429);
    }

    const room = await getRoom(code);
    if (!room) return fail('This room has ended', 410);

    const raw = await readJson(req);
    const check = validateMessage(raw.kind, raw.body);
    if (!check.ok) return fail(check.error ?? 'Invalid message', 400);

    // `to` decides public vs DM. The channel id is derived server-side so a
    // client cannot write into a conversation it is not part of.
    let channel = 'room';
    let to: string | undefined;
    if (typeof raw.to === 'string' && raw.to) {
      if (raw.to === self.uid) return fail('You cannot DM yourself', 400);
      const members = await listMembers(code);
      if (!members.some((m) => m.uid === raw.to)) {
        return fail('That person is no longer in the room', 404);
      }
      to = raw.to;
      channel = dmChannelId(self.uid, to);
    }

    const message = await appendMessage(code, {
      channel,
      kind: check.kind!,
      from: self.uid,
      fromName: self.name,
      fromColor: self.color,
      to,
      body: check.body!,
      meta:
        raw.meta && typeof raw.meta === 'object'
          ? {
              w: Number((raw.meta as Record<string, unknown>).w) || undefined,
              h: Number((raw.meta as Record<string, unknown>).h) || undefined,
              alt: String((raw.meta as Record<string, unknown>).alt ?? '').slice(0, 120),
            }
          : undefined,
    });

    return json({ ok: true, id: message.id });
  } catch (err) {
    return handleRouteError(err);
  }
}
