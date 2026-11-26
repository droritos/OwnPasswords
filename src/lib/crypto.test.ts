import { describe, expect, it } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  WrongPasswordError,
  InvalidDataError,
  changeMasterPassword,
  createBackup,
  createVault,
  decryptJSON,
  deriveKeyFromPassword,
  encryptJSON,
  generateVaultKey,
  openBackup,
  openVault,
  parseBackup,
  randomBytes,
  sealVault,
  unlockWithPassword,
  unwrapVaultKey,
  wrapVaultKey,
  verifyPassword,
} from './crypto';
import { fromB64, toB64 } from './encoding';
import { normalizeEntry } from './vaultModel';
import type { VaultData } from './types';

const sample = (): VaultData => ({
  entries: [
    normalizeEntry({
      id: 'a1',
      title: 'Gmail',
      username: 'me@example.com',
      password: 'correct horse battery staple ✓',
      url: 'https://mail.google.com',
      notes: 'recovery: 1234-5678\nline 2',
      category: 'Personal',
      favorite: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }),
  ],
  categories: ['Gaming'],
});

describe('key derivation', () => {
  it('uses at least 310,000 PBKDF2 iterations', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(310_000);
  });

  it('derives a non-extractable AES-GCM-256 key', async () => {
    const key = await deriveKeyFromPassword('pw', randomBytes(16));
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
  });

  it('is deterministic for the same password + salt and differs per salt', async () => {
    const salt = randomBytes(16);
    const k1 = await deriveKeyFromPassword('hunter2', salt);
    const k2 = await deriveKeyFromPassword('hunter2', salt);
    const k3 = await deriveKeyFromPassword('hunter2', randomBytes(16));
    const blob = await encryptJSON(k1, { ok: true });
    await expect(decryptJSON(k2, blob)).resolves.toEqual({ ok: true });
    await expect(decryptJSON(k3, blob)).rejects.toThrow();
  });
});

describe('AES-GCM encrypt / decrypt', () => {
  it('round-trips JSON including unicode', async () => {
    const key = await generateVaultKey();
    const data = sample();
    const blob = await encryptJSON(key, data);
    expect(blob.ciphertext).not.toContain('Gmail');
    await expect(decryptJSON(key, blob)).resolves.toEqual(data);
  });

  it('uses a fresh 96-bit IV for every encryption', async () => {
    const key = await generateVaultKey();
    const a = await encryptJSON(key, sample());
    const b = await encryptJSON(key, sample());
    expect(fromB64(a.iv)).toHaveLength(12);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects tampered ciphertext (authenticated encryption)', async () => {
    const key = await generateVaultKey();
    const blob = await encryptJSON(key, sample());
    const bytes = fromB64(blob.ciphertext);
    bytes[5] ^= 0x01;
    await expect(decryptJSON(key, { ...blob, ciphertext: toB64(bytes) })).rejects.toThrow();
  });

  it('wraps and unwraps the vault key', async () => {
    const vaultKey = await generateVaultKey();
    const kek = await deriveKeyFromPassword('kek', randomBytes(16));
    const wrapped = await wrapVaultKey(vaultKey, kek);
    const unwrapped = await unwrapVaultKey(wrapped, kek);
    const blob = await encryptJSON(vaultKey, { x: 1 });
    await expect(decryptJSON(unwrapped, blob)).resolves.toEqual({ x: 1 });
  });
});

describe('vault lifecycle', () => {
  it('creates and unlocks a vault with the correct password', async () => {
    const { record } = await createVault('S3cure-Master!', sample());
    expect(record.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    expect(fromB64(record.kdf.salt)).toHaveLength(16);
    expect(JSON.stringify(record)).not.toContain('S3cure-Master!');
    expect(JSON.stringify(record)).not.toContain('me@example.com');

    const { data, session } = await unlockWithPassword(record, 'S3cure-Master!');
    expect(data).toEqual(sample());
    expect(session.passwordKey).not.toBeNull();
  });

  it('rejects a wrong master password', async () => {
    const { record } = await createVault('right password', sample());
    await expect(unlockWithPassword(record, 'wrong password')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(unlockWithPassword(record, '')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('re-seals with a new IV and still opens', async () => {
    const { record, session } = await createVault('pw-pw-pw-pw', sample());
    const changed = sample();
    changed.entries[0].title = 'Changed';
    const sealed = await sealVault(record, session.vaultKey, changed);
    expect(sealed.vault.iv).not.toBe(record.vault.iv);
    expect(sealed.wrappedKey).toEqual(record.wrappedKey);
    const { data } = await unlockWithPassword(sealed, 'pw-pw-pw-pw');
    expect(data.entries[0].title).toBe('Changed');
  });

  it('detects a corrupted stored vault', async () => {
    const { record, session } = await createVault('pw', sample());
    const bytes = fromB64(record.vault.ciphertext);
    bytes[0] ^= 0xff;
    await expect(openVault({ ...record, vault: { ...record.vault, ciphertext: toB64(bytes) } }, session.vaultKey)).rejects.toBeInstanceOf(
      InvalidDataError,
    );
  });

  it('changes the master password with a new salt, key and IV', async () => {
    const { record } = await createVault('old-password', sample());
    await expect(changeMasterPassword(record, 'not-it', 'new-password', sample())).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
    const { record: next } = await changeMasterPassword(record, 'old-password', 'new-password', sample());
    expect(next.kdf.salt).not.toBe(record.kdf.salt);
    expect(next.vault.iv).not.toBe(record.vault.iv);
    expect(next.biometric).toBeUndefined();
    await expect(unlockWithPassword(next, 'old-password')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(unlockWithPassword(next, 'new-password')).resolves.toMatchObject({ data: sample() });
  });
});

describe('encrypted backups', () => {
  it('round-trips through the .vault.enc format', async () => {
    const { record } = await createVault('backup-pw', sample());
    const { passwordKey } = await verifyPassword(record, 'backup-pw');
    const backup = await createBackup(sample(), passwordKey, record.kdf);
    expect(Object.keys(backup)).toEqual(
      expect.arrayContaining(['salt', 'iv', 'ciphertext', 'version', 'timestamp']),
    );
    const parsed = parseBackup(JSON.stringify(backup));
    await expect(openBackup(parsed, 'backup-pw')).resolves.toEqual(sample());
  });

  it('rejects the wrong backup password', async () => {
    const { record } = await createVault('backup-pw', sample());
    const { passwordKey } = await verifyPassword(record, 'backup-pw');
    const backup = await createBackup(sample(), passwordKey, record.kdf);
    await expect(openBackup(backup, 'nope')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('rejects malformed or downgraded backup files', () => {
    expect(() => parseBackup('not json')).toThrow(InvalidDataError);
    expect(() => parseBackup('{}')).toThrow(InvalidDataError);
    const weak = { version: 1, iterations: 1000, salt: 'AAAA', iv: 'AAAA', ciphertext: 'AAAA' };
    expect(() => parseBackup(JSON.stringify(weak))).toThrow(InvalidDataError);
  });
});
