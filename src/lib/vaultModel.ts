import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, type Entry, type VaultData } from './types';

export function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function emptyVault(): VaultData {
  return { entries: [], categories: [] };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Coerce untrusted input (decrypted JSON, CSV rows) into a well-formed Entry. */
export function normalizeEntry(raw: Partial<Record<keyof Entry, unknown>>): Entry {
  const now = Date.now();
  const createdAt = num(raw.createdAt, now);
  return {
    id: str(raw.id) || newId(),
    title: str(raw.title).trim() || hostFromUrl(str(raw.url)) || 'Untitled',
    username: str(raw.username),
    password: str(raw.password),
    url: str(raw.url).trim(),
    notes: str(raw.notes),
    category: str(raw.category).trim() || FALLBACK_CATEGORY,
    favorite: raw.favorite === true,
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt),
  };
}

export function normalizeVaultData(raw: unknown): VaultData {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid vault data');
  const obj = raw as { entries?: unknown; categories?: unknown };
  const entries = Array.isArray(obj.entries)
    ? obj.entries.filter((e) => e && typeof e === 'object').map((e) => normalizeEntry(e as Partial<Entry>))
    : [];
  const categories = Array.isArray(obj.categories)
    ? dedupeCaseInsensitive(obj.categories.map(str).map((c) => c.trim()).filter(Boolean))
    : [];
  return { entries, categories };
}

function dedupeCaseInsensitive(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = c.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Built-in + custom + any category referenced by an entry. */
export function allCategories(data: VaultData): string[] {
  return dedupeCaseInsensitive([
    ...DEFAULT_CATEGORIES,
    ...data.categories,
    ...data.entries.map((e) => e.category),
  ]);
}

export function isBuiltInCategory(name: string): boolean {
  return DEFAULT_CATEGORIES.some((c) => c.toLowerCase() === name.toLowerCase());
}

const fingerprint = (e: Entry) =>
  [e.title.toLowerCase(), e.username.toLowerCase(), e.password].join('\u0000');

export interface MergeResult {
  data: VaultData;
  added: number;
  updated: number;
  skipped: number;
}

/**
 * Merge `incoming` into `base`.
 * - Same id: the most recently updated copy wins.
 * - Different id but identical title/username/password: treated as a duplicate.
 */
export function mergeVaults(base: VaultData, incoming: VaultData): MergeResult {
  const entries = [...base.entries];
  const byId = new Map(entries.map((e, i) => [e.id, i]));
  const prints = new Set(entries.map(fingerprint));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of incoming.entries) {
    const e = normalizeEntry(raw);
    const idx = byId.get(e.id);
    if (idx !== undefined) {
      if (e.updatedAt > entries[idx].updatedAt) {
        entries[idx] = e;
        prints.add(fingerprint(e));
        updated++;
      } else skipped++;
      continue;
    }
    const fp = fingerprint(e);
    if (prints.has(fp)) {
      skipped++;
      continue;
    }
    byId.set(e.id, entries.length);
    prints.add(fp);
    entries.push(e);
    added++;
  }

  const categories = dedupeCaseInsensitive([...base.categories, ...incoming.categories]).filter(
    (c) => !isBuiltInCategory(c),
  );
  return { data: { entries, categories }, added, updated, skipped };
}

export function hostFromUrl(url: string): string {
  if (!url) return '';
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Returns an http(s) URL safe to open, or null (blocks javascript:, data:, etc.). */
export function safeHttpUrl(url: string): string | null {
  if (!url.trim()) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
