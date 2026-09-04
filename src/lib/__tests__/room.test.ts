import { describe, it, expect } from 'vitest';
import { decodeEntry, visibleTo, TERMINATED_PREFIX } from '../room';
import { compareStreamIds } from '../redis';
import { dmChannelId, type ChatMessage } from '../types';

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '1-0', channel: 'room', kind: 'text', from: 'alice',
    fromName: 'Alice', fromColor: '#fff', body: 'hi', ts: 1, ...over,
  };
}

describe('compareStreamIds', () => {
  // Stream ids sort as (millis, seq); a plain string compare gets this wrong
  // once the sequence number reaches double digits.
  it('orders by sequence within the same millisecond', () => {
    expect(compareStreamIds('100-2', '100-10')).toBeLessThan(0);
    expect(String('100-2') < String('100-10')).toBe(false);
  });

  it('orders by millisecond first', () => {
    expect(compareStreamIds('99-9', '100-0')).toBeLessThan(0);
    expect(compareStreamIds('1000-0', '999-0')).toBeGreaterThan(0);
  });

  it('reports equal ids as equal', () => {
    expect(compareStreamIds('100-1', '100-1')).toBe(0);
  });
});

describe('decodeEntry', () => {
  it('decodes a JSON string payload and attaches the id', () => {
    const entry = decodeEntry('7-0', { d: JSON.stringify(msg({ body: 'hello' })) });
    expect(entry).toMatchObject({ id: '7-0', body: 'hello' });
  });

  // Upstash auto-parses JSON-looking values, so `d` may arrive already decoded.
  it('accepts an already-parsed object payload', () => {
    const entry = decodeEntry('8-0', { d: msg({ body: 'parsed' }) });
    expect(entry).toMatchObject({ id: '8-0', body: 'parsed' });
  });

  // One bad entry must not take down the whole stream for everyone.
  it('returns null for malformed JSON instead of throwing', () => {
    expect(decodeEntry('9-0', { d: '{not json' })).toBeNull();
  });

  it('returns null when the payload field is missing', () => {
    expect(decodeEntry('9-0', {})).toBeNull();
  });
});

describe('visibleTo', () => {
  const channel = dmChannelId('alice', 'bob');
  const dm = msg({ channel, from: 'alice', to: 'bob' });

  it('shows public messages to anyone', () => {
    expect(visibleTo(msg(), 'mallory')).toBe(true);
  });

  it('shows a dm to its sender and its recipient', () => {
    expect(visibleTo(dm, 'alice')).toBe(true);
    expect(visibleTo(dm, 'bob')).toBe(true);
  });

  // The whole privacy guarantee of DMs rests on this one returning false.
  it('hides a dm from everyone else', () => {
    expect(visibleTo(dm, 'mallory')).toBe(false);
  });

  it('hides a dm whose channel names an outsider but has no matching uid', () => {
    expect(visibleTo(msg({ channel, from: 'alice', to: 'bob' }), '')).toBe(false);
  });
});

describe('termination marker', () => {
  it('is namespaced so it cannot collide with a typed message', () => {
    expect(TERMINATED_PREFIX).toBe('__terminated__:');
    const marker = msg({ kind: 'system', body: `${TERMINATED_PREFIX}Ada` });
    expect(marker.body.slice(TERMINATED_PREFIX.length)).toBe('Ada');
  });
});
