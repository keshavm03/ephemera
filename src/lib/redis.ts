import { Redis } from '@upstash/redis';
import { requireCredentials, haveCredentials } from './redis-credentials';

let client: Redis | null = null;

export function redis(): Redis {
  if (!client) client = new Redis(requireCredentials());
  return client;
}

export function redisConfigured(): boolean {
  return haveCredentials();
}

/** Stream ids sort as (millis, seq) — plain string compare gets this wrong. */
export function compareStreamIds(a: string, b: string): number {
  const [am, as] = a.split('-').map(Number);
  const [bm, bs] = b.split('-').map(Number);
  return am - bm || as - bs;
}
