/**
 * Zero-knowledge vault cryptography built on the native Web Crypto API.
 *
 * Key hierarchy
 *   Master password --PBKDF2-SHA256 (>=310k iters, random salt)--> Password key (AES-GCM-256, non-extractable)
 *   Vault key: random AES-GCM-256 key, stored only *wrapped* by the password key
 *              (and optionally by a WebAuthn-PRF derived key for biometric unlock).
 *   Vault JSON is encrypted with the vault key, with a fresh 96-bit IV on every save.
 *
 * Backup files are self-contained: the vault JSON encrypted directly with the
 * password key, so they can be opened anywhere with just the master password.
 *
 * Nothing in here ever persists the master password or any raw key material.
 */
import { fromB64, toB64, utf8Decode, utf8Encode, type Bytes } from './encoding';
import { normalizeVaultData } from './vaultModel';
import type { VaultData } from './types';

export const PBKDF2_ITERATIONS = 310_000;
export const MIN_ITERATIONS = 100_000;
export const MAX_ITERATIONS = 10_000_000;
export const KDF_ID = 'PBKDF2-SHA256' as const;
export const FORMAT_VERSION = 1 as const;
export const BACKUP_APP_ID = 'Vaultly' as const;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export class WrongPasswordError extends Error {
  constructor(message = 'Incorrect master password') {
    super(message);
    this.name = 'WrongPasswordError';
  }
}

export class InvalidDataError extends Error {
  constructor(message = 'The data is corrupted or not a valid vault') {
    super(message);
    this.name = 'InvalidDataError';
  }
}

export interface EncryptedBlob {
  iv: string;
  ciphertext: string;
}

export interface KdfParams {
  algorithm: typeof KDF_ID;
  iterations: number;
  salt: string;
}

export interface BiometricWrap {
  credentialId: string;
  prfSalt: string;
  wrappedKey: EncryptedBlob;
  createdAt: number;
}

/** What is persisted in IndexedDB. Contains no secrets in the clear. */
export interface StoredVault {
  version: typeof FORMAT_VERSION;
  kdf: KdfParams;
  wrappedKey: EncryptedBlob;
  vault: EncryptedBlob;
  biometric?: BiometricWrap;
  updatedAt: number;
}

/** Exported `.vault.enc` file. */
export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  version: typeof FORMAT_VERSION;
  kdf: typeof KDF_ID;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  timestamp: string;
}

/** In-memory key material for an unlocked vault. */
export interface VaultSession {
  vaultKey: CryptoKey;
  /** Present after a password unlock; null after a biometric unlock. */
  passwordKey: CryptoKey | null;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto is unavailable. Open the app over HTTPS or localhost.');
  return s;
}

export function randomBytes(length: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

// ---------------------------------------------------------------- primitives

export async function deriveKeyFromPassword(
  password: string,
  salt: Bytes,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (!password) throw new WrongPasswordError('Master password is required');
  const base = await subtle().importKey('raw', utf8Encode(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

export async function encryptBytes(key: CryptoKey, plaintext: Bytes): Promise<EncryptedBlob> {
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decryptBytes(key: CryptoKey, blob: EncryptedBlob): Promise<ArrayBuffer> {
  return subtle().decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ciphertext));
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  return encryptBytes(key, utf8Encode(JSON.stringify(value)));
}

export async function decryptJSON<T = unknown>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  return JSON.parse(utf8Decode(await decryptBytes(key, blob))) as T;
}

export async function generateVaultKey(): Promise<CryptoKey> {
  // Extractable only so it can be *wrapped* (never exported in the clear).
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapVaultKey(vaultKey: CryptoKey, wrappingKey: CryptoKey): Promise<EncryptedBlob> {
  const iv = randomBytes(IV_BYTES);
  const wrapped = await subtle().wrapKey('raw', vaultKey, wrappingKey, { name: 'AES-GCM', iv });
  return { iv: toB64(iv), ciphertext: toB64(wrapped) };
}

export async function unwrapVaultKey(blob: EncryptedBlob, wrappingKey: CryptoKey): Promise<CryptoKey> {
  return subtle().unwrapKey(
    'raw',
    fromB64(blob.ciphertext),
    wrappingKey,
    { name: 'AES-GCM', iv: fromB64(blob.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------- vault lifecycle

export async function createVault(
  password: string,
  data: VaultData,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ record: StoredVault; session: VaultSession }> {
  const salt = randomBytes(SALT_BYTES);
  const passwordKey = await deriveKeyFromPassword(password, salt, iterations);
  const vaultKey = await generateVaultKey();
  const record: StoredVault = {
    version: FORMAT_VERSION,
    kdf: { algorithm: KDF_ID, iterations, salt: toB64(salt) },
    wrappedKey: await wrapVaultKey(vaultKey, passwordKey),
    vault: await encryptJSON(vaultKey, data),
    updatedAt: Date.now(),
  };
  return { record, session: { vaultKey, passwordKey } };
}

/** Derives the password key and proves it is correct by unwrapping the vault key. */
export async function verifyPassword(
  record: StoredVault,
  password: string,
): Promise<{ passwordKey: CryptoKey; vaultKey: CryptoKey }> {
  const passwordKey = await deriveKeyFromPassword(password, fromB64(record.kdf.salt), record.kdf.iterations);
  try {
    const vaultKey = await unwrapVaultKey(record.wrappedKey, passwordKey);
    return { passwordKey, vaultKey };
  } catch {
    throw new WrongPasswordError();
  }
}

export async function openVault(record: StoredVault, vaultKey: CryptoKey): Promise<VaultData> {
  let raw: unknown;
  try {
    raw = await decryptJSON(vaultKey, record.vault);
  } catch {
    throw new InvalidDataError('Vault data could not be decrypted (corrupted or tampered).');
  }
  return normalizeVaultData(raw);
}

export async function unlockWithPassword(
  record: StoredVault,
  password: string,
): Promise<{ data: VaultData; session: VaultSession }> {
  const { passwordKey, vaultKey } = await verifyPassword(record, password);
  const data = await openVault(record, vaultKey);
  return { data, session: { vaultKey, passwordKey } };
}

/** Re-encrypts the vault with a fresh IV. */
export async function sealVault(record: StoredVault, vaultKey: CryptoKey, data: VaultData): Promise<StoredVault> {
  return { ...record, vault: await encryptJSON(vaultKey, data), updatedAt: Date.now() };
}

/**
 * Verifies the current password, then builds a brand-new vault: new salt, new
 * vault key, new IVs. Biometric unlock is dropped (it wrapped the old key).
 */
export async function changeMasterPassword(
  record: StoredVault,
  currentPassword: string,
  newPassword: string,
  data: VaultData,
): Promise<{ record: StoredVault; session: VaultSession }> {
  await verifyPassword(record, currentPassword);
  return createVault(newPassword, data, Math.max(record.kdf.iterations, PBKDF2_ITERATIONS));
}

// ---------------------------------------------------------------- backups

export async function createBackup(data: VaultData, passwordKey: CryptoKey, kdf: KdfParams): Promise<BackupFile> {
  const blob = await encryptJSON(passwordKey, data);
  return {
    app: BACKUP_APP_ID,
    version: FORMAT_VERSION,
    kdf: KDF_ID,
    iterations: kdf.iterations,
    salt: kdf.salt,
    iv: blob.iv,
    ciphertext: blob.ciphertext,
    timestamp: new Date().toISOString(),
  };
}

const isB64 = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(v);

export function parseBackup(text: string): BackupFile {
  const invalid = () => new InvalidDataError('This file is not a valid encrypted backup.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (!parsed || typeof parsed !== 'object') throw invalid();
  const obj = parsed as Record<string, unknown>;
  const { iterations, salt, iv, ciphertext, timestamp } = obj;
  if (
    obj.version !== FORMAT_VERSION ||
    (obj.kdf !== undefined && obj.kdf !== KDF_ID) ||
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < MIN_ITERATIONS ||
    iterations > MAX_ITERATIONS ||
    !isB64(salt) ||
    !isB64(iv) ||
    !isB64(ciphertext)
  ) {
    throw invalid();
  }
  return {
    app: BACKUP_APP_ID,
    version: FORMAT_VERSION,
    kdf: KDF_ID,
    iterations,
    salt,
    iv,
    ciphertext,
    timestamp: typeof timestamp === 'string' ? timestamp : '',
  };
}

export async function openBackup(backup: BackupFile, password: string): Promise<VaultData> {
  const key = await deriveKeyFromPassword(password, fromB64(backup.salt), backup.iterations);
  let raw: unknown;
  try {
    raw = await decryptJSON(key, { iv: backup.iv, ciphertext: backup.ciphertext });
  } catch {
    throw new WrongPasswordError('Wrong password for this backup (or the file is damaged).');
  }
  return normalizeVaultData(raw);
}
