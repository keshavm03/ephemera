const ADJECTIVES = [
  'Swift', 'Quiet', 'Crimson', 'Lunar', 'Velvet', 'Amber', 'Neon', 'Hollow',
  'Wired', 'Golden', 'Frosted', 'Rogue', 'Cobalt', 'Solar', 'Drifting',
  'Electric', 'Midnight', 'Copper', 'Feral', 'Polar',
];

const NOUNS = [
  'Fox', 'Otter', 'Comet', 'Falcon', 'Moth', 'Beacon', 'Wolf', 'Ember',
  'Heron', 'Panther', 'Sparrow', 'Kite', 'Lynx', 'Raven', 'Marlin',
  'Badger', 'Cipher', 'Nomad', 'Echo', 'Pilot',
];

/** Palette is fixed so a person keeps one colour for the life of the room. */
export const COLORS = [
  '#f97316', '#22d3ee', '#a78bfa', '#f472b6', '#4ade80',
  '#facc15', '#60a5fa', '#fb7185', '#34d399', '#c084fc',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** A throwaway handle, e.g. "MidnightHeron". No account, no history. */
export function randomName(): string {
  return `${pick(ADJECTIVES)}${pick(NOUNS)}`;
}

export function randomColor(): string {
  return pick(COLORS);
}

/** Room codes skip 0/O/1/I so they survive being read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomRoomCode(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function randomId(len = 16): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Trim, collapse whitespace, cap length. Empty input falls back to random. */
export function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') return randomName();
  const clean = input.replace(/\s+/g, ' ').trim().slice(0, 24);
  return clean.length >= 1 ? clean : randomName();
}
