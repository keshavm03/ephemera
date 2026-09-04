import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { restUrl, restToken, haveCredentials, requireCredentials } from '../redis-credentials';

const NAMES = [
  'KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'strg_KV_REST_API_URL', 'STRG_KV_REST_API_URL',
  'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'strg_KV_REST_API_TOKEN', 'STRG_KV_REST_API_TOKEN',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  for (const n of NAMES) delete process.env[n];
});

afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
});

describe('credential resolution', () => {
  it('reads the canonical Vercel KV names', () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'tok';
    expect(restUrl()).toBe('https://example.upstash.io');
    expect(haveCredentials()).toBe(true);
  });

  it('falls back to the Upstash console names', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://console.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    expect(restUrl()).toBe('https://console.upstash.io');
  });

  it('falls back to the marketplace-prefixed names', () => {
    process.env.strg_KV_REST_API_URL = 'https://strg.upstash.io';
    process.env.strg_KV_REST_API_TOKEN = 'tok';
    expect(restUrl()).toBe('https://strg.upstash.io');
    expect(restToken()).toBe('tok');
  });

  it('trims surrounding whitespace', () => {
    process.env.KV_REST_API_URL = '  https://example.upstash.io  ';
    expect(restUrl()).toBe('https://example.upstash.io');
  });

  /**
   * The regression this file exists for. A Vercel "Sensitive" variable
   * registers its key in process.env but injects no value, so it arrives as ''.
   * Under the old `??` chain that empty string won, silently shadowing every
   * working alternative and reporting Redis as unconfigured while the keys were
   * all visibly present.
   */
  it('treats an empty value as absent and keeps looking', () => {
    process.env.KV_REST_API_URL = '';
    process.env.UPSTASH_REDIS_REST_URL = 'https://fallback.upstash.io';
    expect(restUrl()).toBe('https://fallback.upstash.io');
  });

  it('treats a whitespace-only value as absent', () => {
    process.env.KV_REST_API_TOKEN = '   ';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'real-token';
    expect(restToken()).toBe('real-token');
  });

  it('reports missing credentials rather than guessing', () => {
    expect(haveCredentials()).toBe(false);
    expect(restUrl()).toBeUndefined();
  });

  it('throws an actionable error when credentials are absent', () => {
    expect(() => requireCredentials()).toThrow(/Redis is not configured/);
    expect(() => requireCredentials()).toThrow(/Sensitive/);
  });

  it('needs both halves before it reports configured', () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    expect(haveCredentials()).toBe(false);
  });
});
