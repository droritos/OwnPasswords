import { normalizeEntry } from './vaultModel';
import type { Entry } from './types';

/** RFC 4180-style CSV parser (quoted fields, escaped quotes, CRLF/LF, newlines in quotes). */
export function parseCSV(text: string): string[][] {
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
    if (c === '"') inQuotes = true;
    else if (c === ',') {
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

const HEADER_ALIASES: Record<Field, string[]> = {
  title: ['name', 'title', 'account', 'site', 'service'],
  url: ['url', 'website', 'login_uri', 'uri', 'web site', 'link'],
  username: ['username', 'user', 'login', 'login_username', 'email', 'user name'],
  password: ['password', 'login_password', 'pass'],
  notes: ['note', 'notes', 'extra', 'comment', 'comments'],
  category: ['category', 'folder', 'group', 'grouping'],
};

/**
 * Imports a plain CSV. Recognises common exports (Chrome, Firefox, Bitwarden,
 * 1Password, LastPass) by header; without a header assumes `name,url,username,password`.
 */
export function entriesFromCSV(text: string): Entry[] {
  const rows = parseCSV(text);
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const map: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    const idx = header.findIndex((h) => HEADER_ALIASES[field].includes(h));
    if (idx >= 0) map[field] = idx;
  }
  const hasHeader = map.password !== undefined || (map.title !== undefined && map.username !== undefined);
  const columns: Partial<Record<Field, number>> = hasHeader
    ? map
    : { title: 0, url: 1, username: 2, password: 3, notes: 4 };
  const body = hasHeader ? rows.slice(1) : rows;

  const get = (row: string[], f: Field) => {
    const i = columns[f];
    return i === undefined ? '' : (row[i] ?? '');
  };

  return body
    .map((row) =>
      normalizeEntry({
        title: get(row, 'title'),
        url: get(row, 'url'),
        username: get(row, 'username'),
        password: get(row, 'password'),
        notes: get(row, 'notes'),
        category: get(row, 'category'),
      }),
    )
    .filter((e) => e.password || e.username || e.url);
}
