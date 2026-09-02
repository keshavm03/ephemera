/**
 * Every key for a room is prefixed with `room:{code}:` so terminating a room is
 * a matter of deleting three keys — no scan, no cleanup job, no orphans.
 */
export const K = {
  meta: (code: string) => `room:${code}:meta`,
  stream: (code: string) => `room:${code}:stream`,
  members: (code: string) => `room:${code}:members`,
  all: (code: string) => [K.meta(code), K.stream(code), K.members(code)],
};

/** Sliding idle window. Any write bumps it; a silent room disappears. */
export const ROOM_TTL_SECONDS = 60 * 60 * 12; // 12h

/** Grace period after `terminate` so live clients receive the goodbye frame. */
export const TERMINATION_GRACE_SECONDS = 15;

/** Stream is capped, so a long-running room can't grow without bound. */
export const STREAM_MAXLEN = 500;

/** A member is "here" if they have heartbeat within this window. */
export const PRESENCE_WINDOW_MS = 45_000;
