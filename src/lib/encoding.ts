/** Byte array backed by a plain ArrayBuffer (what Web Crypto accepts as BufferSource). */
export type Bytes = Uint8Array<ArrayBuffer>;

export function toB64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function fromB64(b64: string): Bytes {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8Encode(text: string): Bytes {
  return new TextEncoder().encode(text) as Bytes;
}

export function utf8Decode(data: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(data);
}
