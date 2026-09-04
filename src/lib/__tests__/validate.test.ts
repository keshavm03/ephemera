import { describe, it, expect } from 'vitest';
import { validateMessage, normalizeCode, MAX_TEXT_LENGTH } from '../validate';
import { ALL_STICKERS } from '../stickers';

describe('validateMessage — text', () => {
  it('accepts and trims ordinary text', () => {
    const r = validateMessage('text', '  hello there  ');
    expect(r).toMatchObject({ ok: true, kind: 'text', body: 'hello there' });
  });

  it('rejects whitespace-only text', () => {
    expect(validateMessage('text', '   \n\t ').ok).toBe(false);
  });

  it('accepts text of exactly the maximum length', () => {
    expect(validateMessage('text', 'a'.repeat(MAX_TEXT_LENGTH)).ok).toBe(true);
  });

  it('rejects text one character over the maximum', () => {
    const r = validateMessage('text', 'a'.repeat(MAX_TEXT_LENGTH + 1));
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MAX_TEXT_LENGTH));
  });

  it('rejects a non-string body', () => {
    expect(validateMessage('text', 42).ok).toBe(false);
    expect(validateMessage('text', null).ok).toBe(false);
  });
});

describe('validateMessage — sticker', () => {
  it('accepts a sticker from the bundled pack', () => {
    const first = [...ALL_STICKERS][0];
    expect(validateMessage('sticker', first)).toMatchObject({ ok: true, kind: 'sticker' });
  });

  it('rejects an emoji that is not in the pack', () => {
    expect(validateMessage('sticker', '🫥').ok).toBe(false);
  });

  it('does not trim stickers into existence', () => {
    expect(validateMessage('sticker', ' 👍 ').ok).toBe(false);
  });
});

describe('validateMessage — gif', () => {
  it('accepts an https giphy url', () => {
    const url = 'https://media.giphy.com/media/abc/giphy.gif';
    expect(validateMessage('gif', url)).toMatchObject({ ok: true, kind: 'gif' });
  });

  it('accepts every numbered giphy media host', () => {
    for (const host of ['media0', 'media1', 'media2', 'media3', 'media4']) {
      expect(validateMessage('gif', `https://${host}.giphy.com/x.gif`).ok).toBe(true);
    }
  });

  it('rejects http, even on an allowed host', () => {
    expect(validateMessage('gif', 'http://media.giphy.com/x.gif').ok).toBe(false);
  });

  // The allowlist is what stops a crafted payload turning the message list
  // into an arbitrary-image or tracking-pixel surface for everyone in the room.
  it('rejects a non-giphy host', () => {
    expect(validateMessage('gif', 'https://evil.example.com/x.gif').ok).toBe(false);
  });

  it('rejects a lookalike host that merely contains giphy.com', () => {
    expect(validateMessage('gif', 'https://media.giphy.com.evil.example/x.gif').ok).toBe(false);
  });

  it('rejects a url whose userinfo spoofs an allowed host', () => {
    expect(validateMessage('gif', 'https://media.giphy.com@evil.example/x.gif').ok).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(validateMessage('gif', 'not a url').ok).toBe(false);
  });
});

describe('validateMessage — kind', () => {
  it('refuses an unknown kind', () => {
    expect(validateMessage('video', 'x').ok).toBe(false);
  });

  // 'system' is server-generated only; a client must never be able to forge one.
  it('refuses the system kind from a client', () => {
    expect(validateMessage('system', 'anything').ok).toBe(false);
  });
});

describe('normalizeCode', () => {
  it('uppercases and trims', () => {
    expect(normalizeCode('  abc123  ')).toBe('ABC123');
  });

  it('rejects codes that are too short or too long', () => {
    expect(normalizeCode('ABC')).toBeNull();
    expect(normalizeCode('A'.repeat(11))).toBeNull();
  });

  it('rejects non-alphanumerics, including path traversal attempts', () => {
    expect(normalizeCode('AB-123')).toBeNull();
    expect(normalizeCode('../ABC')).toBeNull();
    expect(normalizeCode('room:X:meta')).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeCode(undefined)).toBeNull();
    expect(normalizeCode(123456)).toBeNull();
  });
});
