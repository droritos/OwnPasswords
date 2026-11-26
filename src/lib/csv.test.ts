import { describe, expect, it } from 'vitest';
import { entriesFromCSV, parseCSV } from './csv';
import { mergeVaults, normalizeEntry, safeHttpUrl } from './vaultModel';

describe('CSV parsing', () => {
  it('handles quotes, escaped quotes, commas and newlines', () => {
    const rows = parseCSV('a,"b,c","d ""e""",\r\n"multi\nline",x,y,z\n');
    expect(rows).toEqual([
      ['a', 'b,c', 'd "e"', ''],
      ['multi\nline', 'x', 'y', 'z'],
    ]);
  });

  it('imports the Chrome name,url,username,password format', () => {
    const csv = 'name,url,username,password\nGitHub,https://github.com,octo,s3cret\n';
    const [e] = entriesFromCSV(csv);
    expect(e).toMatchObject({ title: 'GitHub', url: 'https://github.com', username: 'octo', password: 's3cret' });
  });

  it('maps headers in any order and falls back to the URL host for the title', () => {
    const csv = 'login_password,login_uri,login_username,name\npw,https://www.example.com/login,me,\n';
    const [e] = entriesFromCSV(csv);
    expect(e).toMatchObject({ title: 'example.com', username: 'me', password: 'pw' });
  });

  it('assumes name,url,username,password when there is no header', () => {
    const [e] = entriesFromCSV('Bank,https://bank.test,alice,pa55\n');
    expect(e).toMatchObject({ title: 'Bank', username: 'alice', password: 'pa55' });
  });
});

describe('merge', () => {
  it('keeps the newest copy and skips duplicates', () => {
    const a = normalizeEntry({ id: '1', title: 'A', password: 'x', updatedAt: 1 });
    const a2 = { ...a, password: 'y', updatedAt: 2 };
    const dup = normalizeEntry({ id: '9', title: 'A', password: 'y' });
    const b = normalizeEntry({ id: '2', title: 'B', password: 'z' });
    const r = mergeVaults({ entries: [a], categories: [] }, { entries: [a2, dup, b], categories: ['Games'] });
    expect(r).toMatchObject({ added: 1, updated: 1, skipped: 1 });
    expect(r.data.entries.find((e) => e.id === '1')?.password).toBe('y');
    expect(r.data.categories).toEqual(['Games']);
  });
});

describe('safeHttpUrl', () => {
  it('only allows http(s)', () => {
    expect(safeHttpUrl('example.com')).toBe('https://example.com/');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });
});
