/**
 * Biometric quick-unlock via WebAuthn + the PRF extension.
 *
 * A platform credential (Face ID / Touch ID / fingerprint / Windows Hello) is
 * created on this device. Each time the user verifies, the authenticator
 * returns a deterministic 32-byte secret (PRF output) for our salt. That secret
 * is run through HKDF to get an AES key which wraps the vault key.
 *
 * The PRF secret never leaves the authenticator unless the user verifies, and
 * nothing that can unwrap the vault is stored on disk. Devices without PRF
 * support are rejected rather than falling back to an insecure "presence only"
 * check that would require storing the key in the clear.
 */
import { fromB64, toB64, utf8Encode, type Bytes } from './encoding';
import { randomBytes, unwrapVaultKey, wrapVaultKey, type BiometricWrap } from './crypto';

export class BiometricUnsupportedError extends Error {
  constructor(message = 'This device or browser does not support biometric vault encryption (WebAuthn PRF).') {
    super(message);
    this.name = 'BiometricUnsupportedError';
  }
}

interface PrfInputs {
  prf: { eval: { first: BufferSource } };
}
interface PrfOutputs {
  prf?: { enabled?: boolean; results?: { first?: BufferSource } };
}

const HKDF_INFO = utf8Encode('OwnPasswords biometric KEK v1');

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

function toBytes(src: BufferSource): Bytes {
  if (src instanceof ArrayBuffer) return new Uint8Array(src.slice(0));
  const view = src as ArrayBufferView;
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer);
}

async function prfToKey(prf: BufferSource): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', toBytes(prf), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: HKDF_INFO },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function evaluatePrf(credentialId: Bytes, prfSalt: Bytes): Promise<BufferSource> {
  const extensions: PrfInputs = { prf: { eval: { first: prfSalt } } };
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: extensions as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error('Biometric verification was cancelled.');
  const out = assertion.getClientExtensionResults() as unknown as PrfOutputs;
  const first = out.prf?.results?.first;
  if (!first) throw new BiometricUnsupportedError();
  return first;
}

/** Registers a platform credential and wraps the vault key with its PRF secret. */
export async function registerBiometric(vaultKey: CryptoKey): Promise<BiometricWrap> {
  if (!(await isBiometricAvailable())) throw new BiometricUnsupportedError();
  const prfSalt = randomBytes(32);
  const extensions: PrfInputs = { prf: { eval: { first: prfSalt } } };
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'OwnPasswords' },
      user: { id: randomBytes(16), name: 'OwnPasswords vault', displayName: 'OwnPasswords vault' },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      attestation: 'none',
      timeout: 60_000,
      extensions: extensions as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Biometric registration was cancelled.');

  const ext = credential.getClientExtensionResults() as unknown as PrfOutputs;
  if (ext.prf?.enabled === false) throw new BiometricUnsupportedError();

  const credentialId = new Uint8Array(credential.rawId.slice(0));
  // Some authenticators return the PRF result at creation; others only on get().
  const prf = ext.prf?.results?.first ?? (await evaluatePrf(credentialId, prfSalt));
  const kek = await prfToKey(prf);

  return {
    credentialId: toB64(credentialId),
    prfSalt: toB64(prfSalt),
    wrappedKey: await wrapVaultKey(vaultKey, kek),
    createdAt: Date.now(),
  };
}

export async function unlockWithBiometric(wrap: BiometricWrap): Promise<CryptoKey> {
  const prf = await evaluatePrf(fromB64(wrap.credentialId), fromB64(wrap.prfSalt));
  const kek = await prfToKey(prf);
  try {
    return await unwrapVaultKey(wrap.wrappedKey, kek);
  } catch {
    throw new Error('Biometric key no longer matches this vault. Unlock with your master password and re-enable it.');
  }
}
