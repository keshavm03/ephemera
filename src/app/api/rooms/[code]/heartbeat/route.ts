import { heartbeat, listMembers, getRoom } from '@/lib/room';
import { readSession } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { json, fail, handleRouteError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/**
 * The SSE loop keeps presence fresh on its own; this exists for the moments it
 * can't — a tab coming back from background, or a client whose stream dropped.
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);

    const self = await readSession(code);
    if (!self) return fail('Join the room first', 401);
    if (!(await getRoom(code))) return fail('This room has ended', 410);

    await heartbeat(code, self.uid);
    return json({ ok: true, members: await listMembers(code) });
  } catch (err) {
    return handleRouteError(err);
  }
}
