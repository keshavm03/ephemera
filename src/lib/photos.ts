import { redis } from './redis';
import { K, PHOTO_TTL_SECONDS, MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES } from './keys';
import { randomId } from './names';
import { isDmChannel } from './types';

/**
 * Photo storage.
 *
 * Blobs live in Redis beside the room rather than in object storage. That is a
 * deliberate trade: an external bucket would handle bigger files, but it would
 * also mean the "everything is deleted when the room ends" promise depended on
 * a second system and a cleanup job that could silently fail. Here a photo is
 * just another key under `room:{code}:`, so it dies with the room by the same
 * mechanism as the transcript.
 *
 * The cost of that choice is a size ceiling, which the browser handles by
 * downscaling before upload.
 */

export interface StoredPhoto {
  id: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  /** Author, and the channel it was posted to — this is the access boundary. */
  from: string;
  channel: string;
  to?: string;
}

interface PhotoRecord extends StoredPhoto {
  /** base64 payload; Redis has no binary type over the REST protocol. */
  data: string;
}

export function isAllowedPhotoType(t: string): boolean {
  return (ALLOWED_PHOTO_TYPES as readonly string[]).includes(t);
}

export async function storePhoto(
  code: string,
  input: {
    bytes: Uint8Array;
    contentType: string;
    width: number;
    height: number;
    from: string;
    channel: string;
    to?: string;
  }
): Promise<StoredPhoto> {
  if (input.bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new Error('Photo is too large after downscaling');
  }
  if (!isAllowedPhotoType(input.contentType)) {
    throw new Error('Unsupported image type');
  }

  const id = randomId();
  const record: PhotoRecord = {
    id,
    contentType: input.contentType,
    width: input.width,
    height: input.height,
    bytes: input.bytes.byteLength,
    from: input.from,
    channel: input.channel,
    to: input.to,
    data: toBase64(input.bytes),
  };

  const r = redis();
  await r.set(K.photo(code, id), JSON.stringify(record), { ex: PHOTO_TTL_SECONDS });
  await r.sadd(K.photoIndex(code), id);
  await r.expire(K.photoIndex(code), PHOTO_TTL_SECONDS);

  const { data: _data, ...meta } = record;
  return meta;
}

export async function readPhoto(
  code: string,
  id: string
): Promise<{ meta: StoredPhoto; bytes: Uint8Array } | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;

  const raw = await redis().get<string | PhotoRecord>(K.photo(code, id));
  if (!raw) return null;

  const record: PhotoRecord = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const { data, ...meta } = record;
  return { meta, bytes: fromBase64(data) };
}

/**
 * Same rule as `visibleTo` for messages: a photo posted into a DM is readable
 * only by its two participants. Ids are unguessable, but the check is here so
 * privacy rests on authorisation rather than on secrecy of the id.
 */
export function photoVisibleTo(meta: StoredPhoto, uid: string): boolean {
  if (!isDmChannel(meta.channel)) return true;
  return meta.from === uid || meta.to === uid;
}

/** Deletes every photo belonging to a room. Called as part of termination. */
export async function deleteAllPhotos(code: string): Promise<number> {
  const r = redis();
  const ids = await r.smembers(K.photoIndex(code));
  if (!ids || ids.length === 0) return 0;

  // Chunked so a room with many photos does not build one enormous command.
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).map((id) => K.photo(code, String(id)));
    await r.del(...batch);
  }
  return ids.length;
}

/* ---------------------------------------------------------------- base64 */

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000; // avoid blowing the argument limit on large images
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
