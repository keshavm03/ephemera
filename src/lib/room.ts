import { redis, compareStreamIds } from './redis';
import {
  K,
  ROOM_TTL_SECONDS,
  TERMINATION_GRACE_SECONDS,
  STREAM_MAXLEN,
  PRESENCE_WINDOW_MS,
} from './keys';
import type { ChatMessage, Member, RoomMeta } from './types';
import { isDmChannel } from './types';

/* ------------------------------------------------------------------ rooms */

export async function createRoom(meta: RoomMeta): Promise<void> {
  const r = redis();
  await r.hset(K.meta(meta.code), meta as unknown as Record<string, unknown>);
  await r.expire(K.meta(meta.code), meta.ttl);
}

export async function getRoom(code: string): Promise<RoomMeta | null> {
  const raw = await redis().hgetall<Record<string, string | number>>(K.meta(code));
  if (!raw || Object.keys(raw).length === 0) return null;
  return {
    code: String(raw.code),
    title: String(raw.title),
    hostId: String(raw.hostId),
    createdAt: Number(raw.createdAt),
    ttl: Number(raw.ttl) || ROOM_TTL_SECONDS,
  };
}

/**
 * Sliding expiry: every write pushes all three keys out again. A room that
 * nobody talks in simply stops existing — no cron, no sweeper.
 */
export async function touchRoom(code: string, ttl = ROOM_TTL_SECONDS): Promise<void> {
  const r = redis();
  await Promise.all(K.all(code).map((k) => r.expire(k, ttl)));
}

/** Marker written to the stream so live clients learn *why* the room vanished. */
export const TERMINATED_PREFIX = '__terminated__:';

/**
 * Terminate is deliberately ordered:
 *
 *   1. append the goodbye marker (needs the stream to still exist),
 *   2. delete the metadata and roster *immediately*,
 *   3. leave only the stream alive for a few seconds so connected clients
 *      receive the marker before it too disappears.
 *
 * Step 2 has to be a delete rather than a short TTL. Every write path calls
 * `touchRoom`, which is an unconditional EXPIRE — so while the meta key still
 * existed, a single reconnecting client's heartbeat would push the TTL back
 * out to 12h and resurrect a room the host had just destroyed. EXPIRE on a
 * missing key is a no-op, so deleting closes that window entirely.
 */
export async function terminateRoom(code: string, byName: string): Promise<void> {
  const r = redis();
  await appendMessage(code, {
    channel: 'room',
    kind: 'system',
    from: 'system',
    fromName: 'system',
    fromColor: '#94a3b8',
    body: `${TERMINATED_PREFIX}${byName}`,
  });
  await r.del(K.meta(code), K.members(code));
  await r.expire(K.stream(code), TERMINATION_GRACE_SECONDS);
}

/* ---------------------------------------------------------------- members */

export async function upsertMember(code: string, member: Member): Promise<void> {
  await redis().hset(K.members(code), { [member.uid]: JSON.stringify(member) });
  await touchRoom(code);
}

export async function heartbeat(code: string, uid: string): Promise<void> {
  const r = redis();
  const raw = await r.hget<string | Member>(K.members(code), uid);
  if (!raw) return;
  const member: Member = typeof raw === 'string' ? JSON.parse(raw) : raw;
  member.lastSeen = Date.now();
  await r.hset(K.members(code), { [uid]: JSON.stringify(member) });
  await touchRoom(code);
}

export async function removeMember(code: string, uid: string): Promise<void> {
  await redis().hdel(K.members(code), uid);
}

export async function listMembers(code: string): Promise<Member[]> {
  const raw = await redis().hgetall<Record<string, string | Member>>(K.members(code));
  if (!raw) return [];
  const now = Date.now();
  return Object.values(raw)
    .map((v) => (typeof v === 'string' ? (JSON.parse(v) as Member) : v))
    // Someone whose tab died stops being "here" without needing a disconnect.
    .filter((m) => now - m.lastSeen < PRESENCE_WINDOW_MS)
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

/* --------------------------------------------------------------- messages */

type NewMessage = Omit<ChatMessage, 'id' | 'ts'> & { ts?: number };

export async function appendMessage(
  code: string,
  msg: NewMessage
): Promise<ChatMessage> {
  const r = redis();
  const record: Omit<ChatMessage, 'id'> = { ...msg, ts: msg.ts ?? Date.now() };

  // One stream carries the public channel *and* every DM. Recipients are
  // filtered server-side on read, which keeps this to a single XRANGE poll
  // per connected client instead of one per open conversation.
  const id = await r.xadd(
    K.stream(code),
    '*',
    { d: JSON.stringify(record) },
    { trim: { type: 'MAXLEN', threshold: STREAM_MAXLEN, comparison: '~' } }
  );

  await touchRoom(code);
  return { ...record, id: String(id) };
}

/** Turns a raw stream entry into a message, or null if it is unreadable. */
export function decodeEntry(id: string, fields: Record<string, unknown>): ChatMessage | null {
  const payload = fields?.d;
  if (!payload) return null;
  try {
    // Upstash auto-parses JSON-looking values, so `d` may already be an object.
    const parsed = (typeof payload === 'string' ? JSON.parse(payload) : payload) as Omit<
      ChatMessage,
      'id'
    >;
    return { ...parsed, id };
  } catch {
    // A malformed entry should never take the whole stream down.
    return null;
  }
}

export interface Since {
  messages: ChatMessage[];
  /**
   * Max *raw* stream id seen, including entries filtered out as someone else's
   * DM. Advancing on raw ids is what stops the cursor from sticking when the
   * newest entries happen to be invisible to this reader.
   */
  cursor: string | null;
}

/**
 * Backfill: reads messages after `afterId` ('-' for the whole retained
 * history) and returns only what `uid` is entitled to see.
 */
export async function fetchSince(
  code: string,
  afterId: string | null,
  uid: string,
  count = 300
): Promise<Since> {
  // "(" makes the range exclusive, so we never replay the last seen message.
  const start = afterId ? `(${afterId}` : '-';
  const res = await redis().xrange(K.stream(code), start, '+', count);
  if (!res) return { messages: [], cursor: afterId };

  const messages: ChatMessage[] = [];
  let cursor = afterId;
  for (const [id, fields] of Object.entries(res)) {
    if (!cursor || compareStreamIds(id, cursor) > 0) cursor = id;
    const msg = decodeEntry(id, fields as Record<string, unknown>);
    if (msg && visibleTo(msg, uid)) messages.push(msg);
  }
  messages.sort((a, b) => compareStreamIds(a.id, b.id));
  return { messages, cursor };
}

/**
 * Looks for the goodbye marker in whatever is left of the stream. Used when a
 * client connects after the meta key is already gone, so it can be told *who*
 * ended the room rather than being left to guess.
 */
export async function findTerminationNotice(code: string): Promise<string | null> {
  const res = await redis().xrange(K.stream(code), '-', '+', 300);
  if (!res) return null;
  for (const [id, fields] of Object.entries(res).reverse()) {
    const msg = decodeEntry(id, fields as Record<string, unknown>);
    if (msg?.kind === 'system' && msg.body.startsWith(TERMINATED_PREFIX)) {
      return msg.body.slice(TERMINATED_PREFIX.length);
    }
  }
  return null;
}

/** Public messages are for everyone; a DM only reaches its two participants. */
export function visibleTo(msg: ChatMessage, uid: string): boolean {
  if (!isDmChannel(msg.channel)) return true;
  return msg.from === uid || msg.to === uid;
}
