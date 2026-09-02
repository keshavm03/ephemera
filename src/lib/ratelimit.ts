import { redis } from './redis';

/**
 * A fixed-window counter in Redis. Anonymous rooms have no accounts to ban, so
 * this is the only thing standing between a room and a flood.
 */
export async function allow(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const r = redis();
  const key = `rl:${bucket}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, windowSeconds);
  return n <= limit;
}
