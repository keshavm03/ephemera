import { readPhoto, photoVisibleTo } from '@/lib/photos';
import { readSession } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { fail, handleRouteError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string; id: string }> };

/**
 * GET /api/rooms/:code/photos/:id
 *
 * Ids are unguessable, but access still rests on the session rather than on
 * the id staying secret: a photo posted into a DM is refused to everyone
 * except its two participants, exactly as the message itself is.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { code: rawCode, id } = await params;
    const code = normalizeCode(rawCode);
    if (!code) return fail('Invalid room code', 400);

    const self = await readSession(code);
    if (!self) return fail('Join the room first', 401);

    const photo = await readPhoto(code, id);
    if (!photo) return fail('That photo is no longer available', 404);

    if (!photoVisibleTo(photo.meta, self.uid)) {
      // Deliberately the same response as a missing photo: confirming that a
      // given id exists would leak that a DM took place.
      return fail('That photo is no longer available', 404);
    }

    return new Response(new Uint8Array(photo.bytes), {
      headers: {
        'Content-Type': photo.meta.contentType,
        'Content-Length': String(photo.bytes.byteLength),
        // Private: the response is authorised per viewer and must never be
        // held in a shared cache. Immutable because the id addresses content
        // that can only ever be replaced by a new id.
        'Cache-Control': 'private, max-age=3600, immutable',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
