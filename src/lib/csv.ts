import { normalizeEntry } from './vaultModel';
import type { Entry } from './types';

export type Delimiter = ',' | ';' | '\t';

/**
 * Guesses the separator from the first line (outside quotes).
 * Handles comma-separated, semicolon-separated (common in European locales /
 * Excel) and tab-separated exports.
 */
export function detectDelimiter(text: string): Delimiter {
  const src = text.replace(/^﻿/, '');
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (c === '\n' || c === '\r') {
        if (counts[','] + counts[';'] + counts['\t'] > 0) break;
      } else if (c === ',' || c === ';' || c === '\t') counts[c]++;
    }
  }
  if (counts['\t'] > 0 && counts['\t'] >= counts[',']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

/** RFC 4180-style parser (quoted fields, escaped quotes, CRLF/LF, newlines in quotes). */
export function parseCSV(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

type Field = 'title' | 'url' | 'username' | 'password' | 'notes' | 'category';

/** Header names are compared lower-cased with spaces, dashes and underscores removed. */
const HEADER_ALIASES: Record<Field, string[]> = {
  title: ['name', 'title', 'account', 'accountname', 'site', 'sitename', 'service', 'entry', 'item', 'label'],
  url: ['url', 'website', 'web', 'site url', 'siteurl', 'websiteurl', 'loginuri', 'uri', 'link', 'address', 'domain'],
  username: ['username', 'user', 'userid', 'login', 'loginname', 'loginusername', 'email', 'emailaddress', 'mail'],
  password: ['password', 'loginpassword', 'pass', 'passwd', 'pwd', 'secret'],
  notes: ['note', 'notes', 'extra', 'comment', 'comments', 'description', 'remarks', 'info'],
  category: ['category', 'folder', 'group', 'grouping', 'type', 'tag', 'tags'],
};

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_\-.]+/g, '');

/**
 * Imports a plain CSV/TSV. Recognises common exports (My Passwords, Google/Chrome,
 * Firefox, Bitwarden, 1Password, LastPass, Samsung Pass) by header, in any column
 * order. Without a header it assumes `name,url,username,password[,notes]`.
 */
export function entriesFromCSV(text: string): Entry[] {
  const rows = parseCSV(text);
  if (!rows.length) return [];

  const header = rows[0].map(normHeader);
  const map: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    const aliases = HEADER_ALIASES[field].map(normHeader);
    const idx = header.findIndex((h, i) => aliases.includes(h) && !Object.values(map).includes(i));
    if (idx >= 0) map[field] = idx;
  }
  const hasHeader = map.password !== undefined || Object.keys(map).length >= 2;
  const columns: Partial<Record<Field, number>> = hasHeader
    ? map
    : { title: 0, url: 1, username: 2, password: 3, notes: 4 };
  const body = hasHeader ? rows.slice(1) : rows;

  const get = (row: string[], f: Field) => {
    const i = columns[f];
    return i === undefined ? '' : (row[i] ?? '').trim();
  };

  return body
    .map((row) =>
      normalizeEntry({
        title: get(row, 'title'),
        url: get(row, 'url'),
        username: get(row, 'username'),
        password: columns.password === undefined ? '' : (row[columns.password] ?? ''),
        notes: get(row, 'notes'),
        category: get(row, 'category'),
      }),
    )
    .filter((e) => e.password || e.username || e.url);
}
