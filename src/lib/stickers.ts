/**
 * The bundled pack. Pure unicode, so it needs no CDN, no API key and no
 * network — the sticker tab works even when Giphy is not configured.
 */
export interface StickerPack {
  name: string;
  stickers: string[];
}

export const STICKER_PACKS: StickerPack[] = [
  {
    name: 'Reactions',
    stickers: ['😂', '🤣', '😭', '😍', '🥹', '😤', '🤯', '🥶', '🫠', '😴', '🤡', '👀', '🙃', '😬', '🫡', '🤌'],
  },
  {
    name: 'Approval',
    stickers: ['👍', '👎', '🔥', '💯', '🎉', '🙌', '👏', '✅', '❌', '⚡', '🚀', '🏆', '💎', '🧠', '💀', '🫶'],
  },
  {
    name: 'Creatures',
    stickers: ['🐱', '🐶', '🦊', '🐼', '🐸', '🐧', '🦉', '🐙', '🦄', '🐝', '🦋', '🐳', '🦖', '🐢', '🦔', '🐌'],
  },
  {
    name: 'Objects',
    stickers: ['☕', '🍕', '🍜', '🌮', '🍺', '🎧', '🎮', '📦', '💡', '🔧', '📌', '🕹️', '🧩', '🪩', '🛰️', '🧊'],
  },
];

export const ALL_STICKERS = new Set(STICKER_PACKS.flatMap((p) => p.stickers));
