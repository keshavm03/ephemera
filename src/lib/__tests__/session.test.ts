import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// session.ts imports next/headers for the cookie helpers. Only the pure
// sign/verify pair is under test here, so the request-scoped API is stubbed.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { signSession, verifySession, cookieName } from '../session';
import type { SessionClaims } from '../types';

const SECRET = 'test-secret-that-is-long-enough';
let saved: string | undefined;

beforeAll(() => {
  saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
});
afterAll(() => {
  if (saved === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = saved;
});

function claims(over: Partial<SessionClaims> = {}): SessionClaims {
  return {
    uid: 'uid-1', name: 'Ada', color: '#f97316', room: 'ABC123',
    host: false, exp: Date.now() + 60_000, ...over,
  };
}

describe('session round trip', () => {
  it('verifies a token it just signed', async () => {
    const token = await signSession(claims());
    await expect(verifySession(token)).resolves.toMatchObject({ uid: 'uid-1', room: 'ABC123' });
  });

  it('survives non-ASCII names through base64url', async () => {
    const token = await signSession(claims({ name: 'Ada 🦊 Łovelace' }));
    const out = await verifySession(token);
    expect(out?.name).toBe('Ada 🦊 Łovelace');
  });

  it('produces a url-safe token with no base64 padding', async () => {
    expect(await signSession(claims())).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});

describe('session rejection', () => {
  it('rejects a tampered payload', async () => {
    const [, sig] = (await signSession(claims())).split('.');
    const forged = Buffer.from(JSON.stringify(claims({ host: true })))
      .toString('base64url');
    await expect(verifySession(`${forged}.${sig}`)).resolves.toBeNull();
  });

  // Host powers (terminating the room) hang off this claim, so forging it is
  // the single most valuable thing an attacker could do.
  it('rejects a token whose signature is from a different secret', async () => {
    const token = await signSession(claims());
    process.env.SESSION_SECRET = 'a-completely-different-secret';
    try {
      await expect(verifySession(token)).resolves.toBeNull();
    } finally {
      process.env.SESSION_SECRET = SECRET;
    }
  });

  it('rejects an expired token', async () => {
    const token = await signSession(claims({ exp: Date.now() - 1 }));
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it('rejects malformed tokens rather than throwing', async () => {
    for (const bad of ['', 'nodot', 'a.b', '.', 'a.', '.b', 'a.b.c']) {
      await expect(verifySession(bad)).resolves.toBeNull();
    }
  });

  it('refuses to sign without a secret', async () => {
    delete process.env.SESSION_SECRET;
    try {
      await expect(signSession(claims())).rejects.toThrow(/SESSION_SECRET/);
    } finally {
      process.env.SESSION_SECRET = SECRET;
    }
  });

  it('refuses a secret that is too short to be meaningful', async () => {
    process.env.SESSION_SECRET = 'short';
    try {
      await expect(signSession(claims())).rejects.toThrow(/SESSION_SECRET/);
    } finally {
      process.env.SESSION_SECRET = SECRET;
    }
  });
});

describe('cookieName', () => {
  // One cookie per room is what lets several rooms be open in one browser.
  it('is scoped per room', () => {
    expect(cookieName('ABC123')).toBe('ephemera_ABC123');
    expect(cookieName('ABC123')).not.toBe(cookieName('XYZ789'));
  });
});
