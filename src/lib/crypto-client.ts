/**
 * Browser-side vault crypto. Runs only in the browser - the derived key never
 * reaches the server, so a database dump cannot reveal any stored password.
 *
 * PBKDF2-SHA256 at 600k iterations (the OWASP 2023 figure) is used rather than
 * Argon2id because it is built into Web Crypto: no WASM bundle, no extra
 * dependency. Argon2id would be the stronger choice and is the natural upgrade
 * if the salt is ever rotated.
 */

const PBKDF2_ITERATIONS = 600_000;
const PROBE = "scvnote-vault-probe-v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(masterPassword: string, saltB64: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(saltB64) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ cipher: string; iv: string }> {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext),
  );
  return { cipher: toBase64(cipher), iv: toBase64(iv) };
}

export async function decrypt(key: CryptoKey, cipherB64: string, ivB64: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) as BufferSource },
    key,
    fromBase64(cipherB64) as BufferSource,
  );
  return dec.decode(plain);
}

/** First-time setup: new salt plus a probe the master password can be checked against. */
export async function initVault(masterPassword: string) {
  const salt = toBase64(randomBytes(16));
  const key = await deriveKey(masterPassword, salt);
  const { cipher, iv } = await encrypt(key, PROBE);
  return { salt, checkCipher: cipher, checkIv: iv, key };
}

/** Returns the key when the master password is right, null when it is not. */
export async function unlockVault(
  masterPassword: string,
  salt: string,
  checkCipher: string,
  checkIv: string,
): Promise<CryptoKey | null> {
  const key = await deriveKey(masterPassword, salt);
  try {
    // AES-GCM authenticates, so a wrong key throws here rather than returning junk
    return (await decrypt(key, checkCipher, checkIv)) === PROBE ? key : null;
  } catch {
    return null;
  }
}
