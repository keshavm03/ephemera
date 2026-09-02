import { removeMember, appendMessage, getRoom } from '@/lib/room';
import { readSession, clearSessionCookie } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { json, fail, handleRouteError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/** POST /api/rooms/:code/leave — drop out without ending the room. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);

    const self = await readSession(code);
    if (!self) return json({ ok: true });

    if (await getRoom(code)) {
      await removeMember(code, self.uid);
      await appendMessage(code, {
        channel: 'room',
        kind: 'system',
        from: 'system',
        fromName: 'system',
        fromColor: '#94a3b8',
        body: `${self.name} left`,
      });
    }

    await clearSessionCookie(code);
    return json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
