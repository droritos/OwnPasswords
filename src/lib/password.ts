export interface GeneratorOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  numbers: boolean;
  symbols: boolean;
}

export const CHARSETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
} as const;

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;

/** Unbiased random integer in [0, max) using rejection sampling. */
export function randomInt(max: number): number {
  if (max <= 0 || max > 2 ** 32) throw new RangeError('max out of range');
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

function selectedSets(opts: GeneratorOptions): string[] {
  const sets = (Object.keys(CHARSETS) as (keyof typeof CHARSETS)[])
    .filter((k) => opts[k])
    .map((k) => CHARSETS[k]);
  return sets.length ? sets : [CHARSETS.lower];
}

/** Generates a password containing at least one character from each selected set. */
export function generatePassword(opts: GeneratorOptions): string {
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.floor(opts.length)));
  const sets = selectedSets(opts);
  const pool = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < length) chars.push(pool[randomInt(pool.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Entropy (bits) of a password produced by the generator with these options. */
export function generatorEntropy(opts: GeneratorOptions): number {
  const pool = selectedSets(opts).join('').length;
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.floor(opts.length)));
  return length * Math.log2(pool);
}

const COMMON = [
  'password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'login', 'iloveyou',
  'monkey', 'dragon', 'master', 'abc123', '123456', '111111', 'football', 'baseball',
  'sunshine', 'princess', 'shadow', 'trustno1',
];

/** Rough entropy estimate (bits) for an arbitrary user-chosen password. */
export function estimateEntropy(pw: string): number {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;

  // Effective length: collapse runs of the same char and simple sequences.
  let effective = 0;
  for (let i = 0; i < pw.length; i++) {
    const prev = pw.charCodeAt(i - 1);
    const cur = pw.charCodeAt(i);
    if (i > 0 && (cur === prev || cur === prev + 1 || cur === prev - 1)) effective += 0.35;
    else effective += 1;
  }
  let bits = effective * Math.log2(Math.max(pool, 2));

  const lower = pw.toLowerCase();
  if (COMMON.some((w) => lower.includes(w))) bits = Math.min(bits, 20) * 0.6;
  const unique = new Set(pw).size;
  if (unique <= 3) bits = Math.min(bits, unique * 4);
  return Math.round(bits);
}

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface Strength {
  bits: number;
  score: StrengthScore;
  label: string;
}

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

export function strengthFromBits(bits: number): Strength {
  const score: StrengthScore = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { bits: Math.round(bits), score, label: LABELS[score] };
}

export function assessPassword(pw: string): Strength {
  return strengthFromBits(estimateEntropy(pw));
}
