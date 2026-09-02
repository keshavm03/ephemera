import { redis, redisConfigured } from '@/lib/redis';
import { blockingXRead } from '@/lib/stream-read';
import { json, handleRouteError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROBE_BLOCK_MS = 3000;

/**
 * GET /api/health — a post-deploy self-check.
 *
 * The interesting part is `blockingReads`. The whole realtime design assumes
 * Upstash's REST proxy honours `XREAD BLOCK`; if it does not, the loop still
 * works (there is a minimum-elapsed floor in stream-read.ts) but silently falls
 * back to a ~1s poll, which costs roughly 25x more Redis commands per client.
 * That difference is invisible from the outside and would only ever show up as
 * a surprise bill, so it is measured here rather than assumed.
 *
 * Reports configuration state only — never any secret value.
 */
export async function GET() {
  const checks: Record<string, unknown> = {
    // TEMP DIAGNOSTIC: key names only, never values.
    envKeysVisible: Object.keys(process.env)
      .filter((k) => /KV_|UPSTASH|SESSION_SECRET|GIPHY|REDIS|strg/i.test(k))
      .sort(),
    redisConfigured: redisConfigured(),
    sessionSecret: secretState(),
    giphy: process.env.GIPHY_API_KEY ? 'enabled' : 'disabled (stickers still work)',
  };

  if (!redisConfigured()) {
    return json({ ok: false, checks, hint: 'Set KV_REST_API_URL and KV_REST_API_TOKEN.' }, 503);
  }

  try {
    const r = redis();

    const pingStart = Date.now();
    await r.ping();
    checks.redisLatencyMs = Date.now() - pingStart;

    // Round-trip a value through a stream, which is the exact shape the chat
    // uses — a plain SET/GET would not exercise stream support at all.
    const probeKey = `health:probe:${Math.random().toString(36).slice(2)}`;
    await r.xadd(probeKey, '*', { d: JSON.stringify({ probe: true }) });
    const range = await r.xrange(probeKey, '-', '+', 1);
    checks.streams = Object.keys(range ?? {}).length === 1 ? 'ok' : 'unexpected response';

    // Ask for entries after an id far in the future: none can exist, so a
    // backend that honours BLOCK waits the full window before answering.
    const blockStart = Date.now();
    await blockingXRead(probeKey, '9999999999999-0', PROBE_BLOCK_MS, undefined, 0);
    const blockedFor = Date.now() - blockStart;

    const honoured = blockedFor >= PROBE_BLOCK_MS * 0.8;
    checks.blockingReads = {
      honoured,
      blockedForMs: blockedFor,
      expectedMs: PROBE_BLOCK_MS,
      meaning: honoured
        ? 'Push delivery: ~3.5k Redis commands per client per day.'
        : 'BLOCK not honoured — falling back to a ~1s poll. Still correct, but ' +
          'roughly 25x more Redis commands per client per day. Consider raising ' +
          'minElapsedMs in src/lib/stream-read.ts to trade latency for cost.',
    };

    await r.del(probeKey);

    return json({ ok: true, checks });
  } catch (err) {
    return handleRouteError(err);
  }
}

function secretState() {
  const s = process.env.SESSION_SECRET;
  if (!s) return 'MISSING — sessions cannot be issued';
  if (s.length < 16) return 'TOO SHORT — needs at least 16 characters';
  if (s.startsWith('local-dev')) return 'ok (but this looks like the local dev value)';
  return 'ok';
}
