import { describe, it, expect } from 'vitest';
import { photoVisibleTo, isAllowedPhotoType, type StoredPhoto } from '../photos';
import { dmChannelId } from '../types';
import { validateMessage } from '../validate';

const base: Omit<StoredPhoto, 'channel' | 'from' | 'to'> = {
  id: 'a'.repeat(32),
  contentType: 'image/webp',
  width: 800,
  height: 600,
  bytes: 1234,
};

describe('photoVisibleTo', () => {
  it('lets anyone see a photo posted to the public channel', () => {
    const photo: StoredPhoto = { ...base, channel: 'room', from: 'alice' };
    expect(photoVisibleTo(photo, 'carol')).toBe(true);
  });

  it('lets both DM participants see it', () => {
    const channel = dmChannelId('alice', 'bob');
    const photo: StoredPhoto = { ...base, channel, from: 'alice', to: 'bob' };
    expect(photoVisibleTo(photo, 'alice')).toBe(true);
    expect(photoVisibleTo(photo, 'bob')).toBe(true);
  });

  it('refuses a third party, which is the whole privacy guarantee', () => {
    const channel = dmChannelId('alice', 'bob');
    const photo: StoredPhoto = { ...base, channel, from: 'alice', to: 'bob' };
    expect(photoVisibleTo(photo, 'carol')).toBe(false);
  });

  it('refuses someone who is merely named in the channel id but is not a party', () => {
    // Guards against deriving access from the channel string rather than from
    // the stored from/to pair.
    const photo: StoredPhoto = {
      ...base,
      channel: dmChannelId('alice', 'bob'),
      from: 'alice',
      to: 'bob',
    };
    expect(photoVisibleTo(photo, 'ali')).toBe(false);
    expect(photoVisibleTo(photo, '')).toBe(false);
  });
});

describe('isAllowedPhotoType', () => {
  it('accepts the four image types we can re-serve', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(isAllowedPhotoType(t)).toBe(true);
    }
  });

  it('rejects anything that could execute or be sniffed as markup', () => {
    for (const t of ['image/svg+xml', 'text/html', 'application/pdf', '', 'image/webp ']) {
      expect(isAllowedPhotoType(t)).toBe(false);
    }
  });
});

describe('validateMessage for photos', () => {
  it('accepts a well-formed photo id', () => {
    const r = validateMessage('photo', 'b'.repeat(32));
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('photo');
  });

  it('rejects anything that is not a bare 32-char hex id', () => {
    const bad = [
      'https://evil.example/x.png',
      '../../etc/passwd',
      'B'.repeat(32),
      'b'.repeat(31),
      'b'.repeat(33),
      '',
    ];
    for (const body of bad) {
      expect(validateMessage('photo', body).ok, body).toBe(false);
    }
  });
});
