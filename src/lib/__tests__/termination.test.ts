import { describe, it, expect } from 'vitest';
import { K } from '../keys';

/**
 * Termination deletes keys derived from `K.all`, not a hand-maintained list.
 *
 * The hand-written list was a real trap: `K.all` is the set every write
 * refreshes a TTL on, so adding a key there looked like registering it for
 * deletion as well. A game board added to `K.all` was therefore left in Redis
 * for twelve hours after the room it belonged to had been destroyed — with the
 * players' ids and names still in it.
 *
 * This pins the invariant so the next key added cannot repeat it.
 */
describe('room key registry', () => {
  const code = 'ABC123';

  it('registers every per-room key that termination must delete', () => {
    const all = K.all(code);
    for (const key of [K.meta(code), K.members(code), K.photoIndex(code), K.game(code)]) {
      expect(all, `${key} must be in K.all or termination will miss it`).toContain(key);
    }
  });

  it('includes the stream, which termination expires rather than deletes', () => {
    expect(K.all(code)).toContain(K.stream(code));
  });

  it('scopes every key under the room prefix so deletion can never miss one', () => {
    for (const key of K.all(code)) {
      expect(key.startsWith(`room:${code}:`)).toBe(true);
    }
    expect(K.photo(code, 'a'.repeat(32)).startsWith(`room:${code}:`)).toBe(true);
  });

  it('keeps keys for different rooms disjoint', () => {
    const a = new Set(K.all('AAA111'));
    for (const key of K.all('BBB222')) expect(a.has(key)).toBe(false);
  });
});
