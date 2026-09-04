import { describe, it, expect } from 'vitest';
import { dmChannelId, isDmChannel, dmPeer } from '../types';

describe('dmChannelId', () => {
  // Both participants must derive the same channel id, or each would write
  // into a conversation the other never reads.
  it('is order independent', () => {
    expect(dmChannelId('alice', 'bob')).toBe(dmChannelId('bob', 'alice'));
  });

  it('is marked as a dm channel', () => {
    expect(isDmChannel(dmChannelId('a', 'b'))).toBe(true);
  });

  it('does not treat the public channel as a dm', () => {
    expect(isDmChannel('room')).toBe(false);
  });
});

describe('dmPeer', () => {
  const channel = dmChannelId('alice', 'bob');

  it('returns the other participant', () => {
    expect(dmPeer(channel, 'alice')).toBe('bob');
    expect(dmPeer(channel, 'bob')).toBe('alice');
  });

  // A uid that is not part of the conversation must not resolve to a peer.
  it('returns null for an outsider', () => {
    expect(dmPeer(channel, 'mallory')).toBeNull();
  });

  it('returns null for the public channel', () => {
    expect(dmPeer('room', 'alice')).toBeNull();
  });
});
