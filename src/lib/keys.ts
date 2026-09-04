/**
 * Every key for a room is prefixed with `room:{code}:` so terminating a room is
 * a matter of deleting a known set of keys — no scan, no cleanup job, no
 * orphans. Photos follow the same rule: each blob is its own key, and the ids
 * are tracked in a set so they can be deleted with the room rather than left
 * to expire on their own.
 */
export const K = {
  meta: (code: string) => `room:${code}:meta`,
  stream: (code: string) => `room:${code}:stream`,
  members: (code: string) => `room:${code}:members`,
  /** Set of photo ids belonging to this room. */
  photoIndex: (code: string) => `room:${code}:photos`,
  photo: (code: string, id: string) => `room:${code}:photo:${id}`,
  /** The fixed keys — photo blobs are enumerated via `photoIndex`. */
  all: (code: string) => [
    K.meta(code),
    K.stream(code),
    K.members(code),
    K.photoIndex(code),
  ],
};

/** Sliding idle window. Any write bumps it; a silent room disappears. */
export const ROOM_TTL_SECONDS = 60 * 60 * 12; // 12h

/** Grace period after `terminate` so live clients receive the goodbye frame. */
export const TERMINATION_GRACE_SECONDS = 15;

/** Stream is capped, so a long-running room can't grow without bound. */
export const STREAM_MAXLEN = 500;

/** A member is "here" if they have heartbeat within this window. */
export const PRESENCE_WINDOW_MS = 45_000;

/**
 * Largest photo we will store, after the browser has downscaled it.
 *
 * Upstash's REST endpoint caps a request at 1MB, and base64 inflates by ~4/3,
 * so the binary ceiling has to sit well under 750KB. 400KB leaves room for the
 * surrounding JSON and still carries a 1600px photo at good quality.
 */
export const MAX_PHOTO_BYTES = 400_000;

/** Hard ceiling on what a client may upload before downscaling is attempted. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Photos outlive the room's idle window on purpose. `touchRoom` refreshes a
 * fixed set of keys on every write; extending every photo too would make each
 * message cost O(photos) round-trips. Giving blobs twice the room TTL means a
 * long-lived room never loses its images, and termination deletes them
 * explicitly anyway.
 */
export const PHOTO_TTL_SECONDS = ROOM_TTL_SECONDS * 2;

/** Image types we accept and re-serve. */
export const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
