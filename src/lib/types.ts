export type MessageKind = 'text' | 'gif' | 'sticker' | 'system';

/** A single chat message as it lives inside the Redis stream. */
export interface ChatMessage {
  /** Redis stream id, e.g. "1730000000000-0". Doubles as the SSE event id. */
  id: string;
  /** 'room' for the public channel, or a dm channel id ("dm:<uidA>|<uidB>"). */
  channel: string;
  kind: MessageKind;
  /** Author uid. 'system' for server-generated notices. */
  from: string;
  fromName: string;
  fromColor: string;
  /** Recipient uid — only present on DMs. Used for server-side fan-out filtering. */
  to?: string;
  /** text body, or the gif/sticker url. */
  body: string;
  /** Optional metadata for gifs (dimensions keep the scroll from jumping). */
  meta?: { w?: number; h?: number; alt?: string };
  ts: number;
}

export interface Member {
  uid: string;
  name: string;
  color: string;
  joinedAt: number;
  lastSeen: number;
}

export interface RoomMeta {
  code: string;
  title: string;
  hostId: string;
  createdAt: number;
  /** Seconds of inactivity after which the room evaporates on its own. */
  ttl: number;
}

/** Everything the browser is allowed to know about who it is. */
export interface SessionClaims {
  uid: string;
  name: string;
  color: string;
  room: string;
  host: boolean;
  exp: number;
}

/** Frames pushed down the SSE pipe. */
export type ServerEvent =
  | { type: 'hello'; self: SessionClaims; room: RoomMeta }
  | { type: 'message'; message: ChatMessage }
  | { type: 'presence'; members: Member[] }
  | { type: 'terminated'; by: string }
  | { type: 'ping' };

/** A dm channel id is stable regardless of who opens it first. */
export function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join('|')}`;
}

export function isDmChannel(channel: string): boolean {
  return channel.startsWith('dm:');
}

/** Returns the other participant of a dm channel, from `self`'s point of view. */
export function dmPeer(channel: string, self: string): string | null {
  if (!isDmChannel(channel)) return null;
  const [a, b] = channel.slice(3).split('|');
  if (a === self) return b;
  if (b === self) return a;
  return null;
}
