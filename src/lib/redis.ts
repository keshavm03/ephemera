import { Redis } from '@upstash/redis';

/**
 * Vercel's Upstash integration injects KV_REST_API_*; the Upstash console hands
 * you UPSTASH_REDIS_REST_*. Accept either so the same code runs in both places.
 */
function credentials() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN ' +
        '(or the UPSTASH_REDIS_REST_* equivalents). See .env.example.'
    );
  }
  return { url, token };
}

let client: Redis | null = null;

export function redis(): Redis {
  if (!client) client = new Redis(credentials());
  return client;
}

export function redisConfigured(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

/** Stream ids sort as (millis, seq) — plain string compare gets this wrong. */
export function compareStreamIds(a: string, b: string): number {
  const [am, as] = a.split('-').map(Number);
  const [bm, bs] = b.split('-').map(Number);
  return am - bm || as - bs;
}
