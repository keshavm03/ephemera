import { getRoom, appendMessage, listMembers } from '@/lib/room';
import { storePhoto, isAllowedPhotoType } from '@/lib/photos';
import { MAX_PHOTO_BYTES, MAX_UPLOAD_BYTES } from '@/lib/keys';
import { readSession } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { json, fail, handleRouteError } from '@/lib/api';
import { allow } from '@/lib/ratelimit';
import { dmChannelId } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/rooms/:code/photos — multipart upload.
 *
 * Storing the blob and posting the message happen together rather than as two
 * client-driven steps. A two-step flow would leave an orphaned blob behind
 * whenever the second request failed, and would need an extra ownership check
 * to stop one person attaching another person's upload to their own message.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);

    const self = await readSession(code);
    if (!self) return fail('Join the room first', 401);

    // Photos are far heavier than text, so they get their own tighter budget.
    if (!(await allow(`photo:${code}:${self.uid}`, 10, 60))) {
      return fail('You are sending photos too quickly', 429);
    }

    const room = await getRoom(code);
    if (!room) return fail('This room has ended', 410);

    const form = await req.formData().catch(() => null);
    if (!form) return fail('Expected a multipart upload', 400);

    const file = form.get('photo');
    if (!(file instanceof File)) return fail('No photo attached', 400);
    if (file.size === 0) return fail('That file is empty', 400);
    if (file.size > MAX_UPLOAD_BYTES) return fail('That file is far too large', 413);

    if (!isAllowedPhotoType(file.type)) {
      return fail('Only JPEG, PNG, WebP and GIF images are supported', 415);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_PHOTO_BYTES) {
      // The browser downscales before sending; reaching here means that failed
      // or was bypassed, so say what the actual ceiling is.
      return fail(
        `Photo must be under ${Math.floor(MAX_PHOTO_BYTES / 1000)}KB after downscaling`,
        413
      );
    }

    const width = Number(form.get('w')) || 0;
    const height = Number(form.get('h')) || 0;
    const alt = String(form.get('alt') ?? '').slice(0, 120);

    // Same derivation as text messages: the channel is computed server-side so
    // a client cannot post into a conversation it is not part of.
    let channel = 'room';
    let to: string | undefined;
    const rawTo = form.get('to');
    if (typeof rawTo === 'string' && rawTo) {
      if (rawTo === self.uid) return fail('You cannot DM yourself', 400);
      const members = await listMembers(code);
      if (!members.some((m) => m.uid === rawTo)) {
        return fail('That person is no longer in the room', 404);
      }
      to = rawTo;
      channel = dmChannelId(self.uid, to);
    }

    const photo = await storePhoto(code, {
      bytes,
      contentType: file.type,
      width,
      height,
      from: self.uid,
      channel,
      to,
    });

    const message = await appendMessage(code, {
      channel,
      kind: 'photo',
      from: self.uid,
      fromName: self.name,
      fromColor: self.color,
      to,
      body: photo.id,
      meta: { w: photo.width, h: photo.height, alt },
    });

    return json({ ok: true, id: message.id, photoId: photo.id });
  } catch (err) {
    return handleRouteError(err);
  }
}
