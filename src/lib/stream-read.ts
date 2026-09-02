/**
 * Upstash's REST endpoint speaks raw Redis commands, which lets us use a
 * *blocking* XREAD. That matters a lot here: a naive 500ms poll costs ~170k
 * Redis commands per client per day and would burn through a free tier in
 * hours, whereas a 25s blocking read costs ~3.5k/day *and* delivers messages
 * the instant they land instead of up to half a second later.
 */

import { requireCredentials } from './redis-credentials';

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

async function command(cmd: (string | number)[], signal?: AbortSignal): Promise<unknown> {
  const { url, token } = requireCredentials();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
    cache: 'no-store',
    signal,
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

/** XREAD's reply is [[key, [[id, [f, v, f, v...]], ...]], ...]. Flatten it. */
function parseXRead(result: unknown): StreamEntry[] {
  if (!Array.isArray(result)) return [];
  const out: StreamEntry[] = [];
  for (const stream of result) {
    if (!Array.isArray(stream) || stream.length < 2) continue;
    const entries = stream[1];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const id = String(entry[0]);
      const flat = entry[1];
      const fields: Record<string, string> = {};
      if (Array.isArray(flat)) {
        for (let i = 0; i + 1 < flat.length; i += 2) {
          fields[String(flat[i])] = String(flat[i + 1]);
        }
      }
      out.push({ id, fields });
    }
  }
  return out;
}

/**
 * Blocks until entries appear after `lastId`, or `blockMs` elapses.
 *
 * `minElapsedMs` is a safety floor: if a deployment ever ignores BLOCK and
 * returns instantly, this degrades to a slow poll rather than a spin loop that
 * would hammer the Redis quota.
 */
export async function blockingXRead(
  key: string,
  lastId: string,
  blockMs: number,
  signal?: AbortSignal,
  minElapsedMs = 1000
): Promise<StreamEntry[]> {
  const started = Date.now();
  const result = await command(
    ['XREAD', 'BLOCK', blockMs, 'COUNT', 100, 'STREAMS', key, lastId],
    signal
  );
  const entries = parseXRead(result);

  if (entries.length === 0) {
    const elapsed = Date.now() - started;
    if (elapsed < minElapsedMs) {
      await new Promise((r) => setTimeout(r, minElapsedMs - elapsed));
    }
  }
  return entries;
}
