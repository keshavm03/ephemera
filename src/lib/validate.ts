import { ALL_STICKERS } from './stickers';
import type { MessageKind } from './types';

export const MAX_TEXT_LENGTH = 2000;

/** Giphy is the only remote image host we will render. */
const ALLOWED_GIF_HOSTS = [
  'media.giphy.com',
  'i.giphy.com',
  'media0.giphy.com',
  'media1.giphy.com',
  'media2.giphy.com',
  'media3.giphy.com',
  'media4.giphy.com',
];

export interface ValidationResult {
  ok: boolean;
  error?: string;
  kind?: MessageKind;
  body?: string;
}

/**
 * Everything a client sends is re-checked here. In particular the gif url is
 * host-allowlisted so a crafted payload can't turn the message list into an
 * arbitrary-image (or tracking-pixel) surface.
 */
export function validateMessage(kind: unknown, body: unknown): ValidationResult {
  if (typeof body !== 'string') return { ok: false, error: 'body must be a string' };

  switch (kind) {
    case 'text': {
      const trimmed = body.trim();
      if (!trimmed) return { ok: false, error: 'Message is empty' };
      if (trimmed.length > MAX_TEXT_LENGTH)
        return { ok: false, error: `Message exceeds ${MAX_TEXT_LENGTH} characters` };
      return { ok: true, kind: 'text', body: trimmed };
    }

    case 'sticker': {
      if (!ALL_STICKERS.has(body))
        return { ok: false, error: 'Unknown sticker' };
      return { ok: true, kind: 'sticker', body };
    }

    case 'gif': {
      let url: URL;
      try {
        url = new URL(body);
      } catch {
        return { ok: false, error: 'Invalid GIF url' };
      }
      if (url.protocol !== 'https:')
        return { ok: false, error: 'GIF url must be https' };
      if (!ALLOWED_GIF_HOSTS.includes(url.hostname))
        return { ok: false, error: 'GIF host is not allowed' };
      return { ok: true, kind: 'gif', body: url.toString() };
    }

    default:
      return { ok: false, error: 'Unsupported message kind' };
  }
}

/** Room codes are uppercase alphanumerics of a fixed shape. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9]{4,10}$/.test(code) ? code : null;
}
