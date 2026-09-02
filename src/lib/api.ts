import { NextResponse } from 'next/server';

export function json<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === 'number' ? { status: init } : init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Config problems (missing Redis / secret) surface as a clear 503 rather than
 * an opaque 500, because they are the most likely first-deploy stumble.
 */
export function handleRouteError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Unexpected error';
  if (/SESSION_SECRET|Redis is not configured/.test(message)) {
    return fail(message, 503);
  }
  console.error('[ephemera]', err);
  return fail('Something went wrong', 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
