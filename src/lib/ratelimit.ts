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

  // INCR and EXPIRE go in one pipeline. Setting the TTL unconditionally is safe
  // because the key name already contains the window index, and it removes the
  // failure mode of the old `if (n === 1)` form: a key whose EXPIRE was lost to
  // a transient error kept its count forever, silently locking a bucket out.
  const [n] = await r
    .pipeline()
    .incr(key)
    .expire(key, windowSeconds)
    .exec<[number, number]>();

  return n <= limit;
}
