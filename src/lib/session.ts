import { cookies } from 'next/headers';
import type { SessionClaims } from './types';

/**
 * There is no account system. Identity is a signed, room-scoped cookie handed
 * out at join time — enough to stop someone forging another person's uid in a
 * DM, and it dies with the room. Nothing is stored server-side about a person
 * beyond the room's own member hash.
 */

const ENC = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'SESSION_SECRET is missing or too short. Generate one with `openssl rand -hex 32`.'
    );
  }
  return s;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  // Allocated over a plain ArrayBuffer so it satisfies BufferSource, which
  // excludes the SharedArrayBuffer-backed variant.
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    ENC.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSession(claims: SessionClaims): Promise<string> {
  const payload = b64url(ENC.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign('HMAC', await key(), ENC.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      await key(),
      unb64url(sig),
      ENC.encode(payload)
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(unb64url(payload))) as SessionClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** One cookie per room, so several rooms can be open in one browser. */
export function cookieName(code: string): string {
  return `ephemera_${code}`;
}

export async function setSessionCookie(code: string, claims: SessionClaims) {
  const jar = await cookies();
  jar.set(cookieName(code), await signSession(claims), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.max(1, Math.floor((claims.exp - Date.now()) / 1000)),
  });
}

export async function clearSessionCookie(code: string) {
  const jar = await cookies();
  jar.delete(cookieName(code));
}

/** Reads and validates the caller's session for `code`, or null. */
export async function readSession(code: string): Promise<SessionClaims | null> {
  const jar = await cookies();
  const raw = jar.get(cookieName(code))?.value;
  if (!raw) return null;
  const claims = await verifySession(raw);
  // A cookie minted for another room must never authorise this one.
  if (!claims || claims.room !== code) return null;
  return claims;
}
