/**
 * Resolving Upstash REST credentials from the environment.
 *
 * Three naming schemes are in play: Vercel's own KV_* injection, the Upstash
 * console's UPSTASH_REDIS_REST_*, and the Vercel Marketplace integration, which
 * prefixes everything it provisions (e.g. `strg_KV_REST_API_URL`).
 *
 * Empty strings have to be treated as absent, not as values. A Vercel
 * *Sensitive* environment variable registers its key in `process.env` but never
 * injects a value, so it arrives as `''` — and `'' ?? fallback` evaluates to
 * `''`, meaning one misconfigured variable silently shadows every working
 * alternative. That exact case cost a long debugging session: the keys were all
 * visibly present, and the app still reported Redis as unconfigured.
 */
function firstNonEmpty(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

const URL_NAMES = [
  'KV_REST_API_URL',
  'UPSTASH_REDIS_REST_URL',
  'strg_KV_REST_API_URL',
  'STRG_KV_REST_API_URL',
];

const TOKEN_NAMES = [
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_TOKEN',
  'strg_KV_REST_API_TOKEN',
  'STRG_KV_REST_API_TOKEN',
];

export function restUrl(): string | undefined {
  return firstNonEmpty(URL_NAMES);
}

export function restToken(): string | undefined {
  return firstNonEmpty(TOKEN_NAMES);
}

export function haveCredentials(): boolean {
  return Boolean(restUrl() && restToken());
}

export function requireCredentials(): { url: string; token: string } {
  const url = restUrl();
  const token = restToken();
  if (!url || !token) {
    throw new Error(
      'Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN ' +
        '(or the UPSTASH_REDIS_REST_* / strg_ equivalents). Note that a Vercel ' +
        '"Sensitive" variable injects no value at runtime — use a normal one. ' +
        'See .env.example.'
    );
  }
  return { url, token };
}
