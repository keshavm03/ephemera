import { describe, it, expect } from 'vitest';
import { sanitizeName, randomRoomCode, randomId, randomName, randomColor, COLORS } from '../names';

describe('sanitizeName', () => {
  it('collapses runs of whitespace', () => {
    expect(sanitizeName('  Ada   \n Lovelace  ')).toBe('Ada Lovelace');
  });

  it('caps the length at 24 characters', () => {
    expect(sanitizeName('x'.repeat(100))).toHaveLength(24);
  });

  it('falls back to a random name for empty or non-string input', () => {
    for (const input of ['', '   ', undefined, null, 42, {}]) {
      expect(sanitizeName(input).length).toBeGreaterThan(0);
    }
  });
});

describe('randomRoomCode', () => {
  // 0/O and 1/I are excluded so a code survives being read aloud.
  it('never emits a visually ambiguous character', () => {
    const codes = Array.from({ length: 500 }, () => randomRoomCode());
    expect(codes.join('')).not.toMatch(/[01OI]/);
  });

  it('uses only the documented alphabet', () => {
    for (const code of Array.from({ length: 200 }, () => randomRoomCode())) {
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('honours a requested length', () => {
    expect(randomRoomCode(10)).toHaveLength(10);
  });

  it('is not trivially repetitive', () => {
    const codes = new Set(Array.from({ length: 200 }, () => randomRoomCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('randomId', () => {
  it('returns lowercase hex of twice the byte length', () => {
    expect(randomId()).toMatch(/^[0-9a-f]{32}$/);
    expect(randomId(8)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('does not collide across many draws', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomId()));
    expect(ids.size).toBe(1000);
  });
});

describe('randomName / randomColor', () => {
  it('produces an AdjectiveNoun handle', () => {
    expect(randomName()).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  });

  it('only ever picks a colour from the fixed palette', () => {
    for (let i = 0; i < 100; i++) expect(COLORS).toContain(randomColor());
  });
});
