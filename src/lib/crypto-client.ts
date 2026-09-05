/**
 * Browser-side vault crypto. Runs only in the browser - the derived key never
 * reaches the server, so a database dump cannot reveal any stored password.
 *
 * PBKDF2-SHA256 at 600k iterations (the OWASP 2023 figure) is used rather than
 * Argon2id because it is built into Web Crypto: no WASM bundle, no extra
 * dependency. Argon2id would be the stronger choice and is the natural upgrade
 * if the salt is ever rotated.
 *
 * `crypto.subtle` only exists in a secure context (HTTPS, or http://localhost) -
 * a plain-HTTP LAN address (e.g. http://192.168.x.x:3000) does not qualify, and
 * every function below silently gets `undefined` there instead of a working
 * SubtleCrypto. Since this app is meant to also work over plain HTTP on a LAN,
 * every primitive has a pure-JS fallback (node-forge) that only runs when
 * `crypto.subtle` is missing. The two engines are verified to produce
 * byte-identical, cross-importable output (same PBKDF2 bytes, same AES-GCM
 * wire format, same SPKI/PKCS8 DER) so a secret created by one browser can
 * always be read by another regardless of which engine either side is on -
 * see the interop check this was validated against before wiring it in. The
 * trade-off: the pure-JS path has no hardware backing and is a bigger trust
 * surface (an extra dependency) than the browser's own implementation, which
 * is why HTTPS + native WebCrypto stays the preferred path whenever available.
 */
import forge from "node-forge";

const PBKDF2_ITERATIONS = 600_000;
const PROBE = "scvnote-vault-probe-v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

function hasSubtle(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

function toForgeBinary(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary;
}

function fromForgeBinary(binary: string): Uint8Array {
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(toForgeBinary(view));
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function randomBytes(length: number): Uint8Array {
  // available in every context, unlike crypto.subtle - no fallback needed
  return crypto.getRandomValues(new Uint8Array(length));
}

/** One AES-256 key, from either engine - opaque to every caller outside this file. */
export type VaultKey = { kind: "native"; key: CryptoKey } | { kind: "forge"; bytes: Uint8Array };
export type VaultPublicKey =
  | { kind: "native"; key: CryptoKey }
  | { kind: "forge"; key: forge.pki.rsa.PublicKey };
export type VaultPrivateKey =
  | { kind: "native"; key: CryptoKey }
  | { kind: "forge"; key: forge.pki.rsa.PrivateKey };
export type VaultKeyPair = { publicKey: VaultPublicKey; privateKey: VaultPrivateKey };

export async function deriveKey(masterPassword: string, saltB64: string): Promise<VaultKey> {
  const salt = fromBase64(saltB64);
  if (hasSubtle()) {
    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(masterPassword),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    return { kind: "native", key };
  }
  const bytes = fromForgeBinary(
    forge.pkcs5.pbkdf2(
      toForgeBinary(enc.encode(masterPassword)),
      toForgeBinary(salt),
      PBKDF2_ITERATIONS,
      32,
      forge.md.sha256.create(),
    ),
  );
  return { kind: "forge", bytes };
}

export async function encrypt(key: VaultKey, plaintext: string): Promise<{ cipher: string; iv: string }> {
  const iv = randomBytes(12);
  if (key.kind === "native") {
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key.key,
      enc.encode(plaintext),
    );
    return { cipher: toBase64(cipher), iv: toBase64(iv) };
  }
  const c = forge.cipher.createCipher("AES-GCM", toForgeBinary(key.bytes));
  c.start({ iv: toForgeBinary(iv) });
  c.update(forge.util.createBuffer(forge.util.encodeUtf8(plaintext)));
  c.finish();
  // matches WebCrypto's AES-GCM output convention: ciphertext with the
  // 16-byte auth tag appended, as one combined blob
  const combined = new Uint8Array([
    ...fromForgeBinary(c.output.getBytes()),
    ...fromForgeBinary(c.mode.tag.getBytes()),
  ]);
  return { cipher: toBase64(combined), iv: toBase64(iv) };
}

export async function decrypt(key: VaultKey, cipherB64: string, ivB64: string): Promise<string> {
  const iv = fromBase64(ivB64);
  const combined = fromBase64(cipherB64);
  if (key.kind === "native") {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key.key,
      combined as BufferSource,
    );
    return dec.decode(plain);
  }
  const tag = combined.slice(combined.length - 16);
  const ciphertext = combined.slice(0, combined.length - 16);
  const d = forge.cipher.createDecipher("AES-GCM", toForgeBinary(key.bytes));
  d.start({ iv: toForgeBinary(iv), tag: forge.util.createBuffer(toForgeBinary(tag)) });
  d.update(forge.util.createBuffer(toForgeBinary(ciphertext)));
  // AES-GCM authenticates, so a wrong key or tampered ciphertext fails here
  if (!d.finish()) throw new Error("AES-GCM 태그 검증에 실패했습니다");
  return forge.util.decodeUtf8(d.output.getBytes());
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
): Promise<VaultKey | null> {
  const key = await deriveKey(masterPassword, salt);
  try {
    return (await decrypt(key, checkCipher, checkIv)) === PROBE ? key : null;
  } catch {
    return null;
  }
}

/* ------------------------- project-shared vault crypto -------------------------
 *
 * Personal secrets stay symmetric (above): one key, derived from one master
 * password, only its owner ever holds it. Sharing a secret with a project's
 * other members needs a second key that many different master passwords can
 * all unlock - which a symmetric key alone can never provide, since there's
 * no way to hand the same secret key to someone without a key of theirs to
 * protect it in transit. The fix is the same one Bitwarden/1Password use:
 *
 *   - every user also gets an RSA-OAEP keypair; the private half is
 *     encrypted with their own personal AES key (so only they can open it),
 *     the public half is stored in the clear (safe - it's a public key)
 *   - each project that turns sharing on gets one random AES-256 key
 *   - that project key is handed to a member by RSA-OAEP "wrapping" it with
 *     THEIR public key - only their private key can unwrap it, and nobody
 *     needs to know anyone else's master password to do this
 *
 * The server only ever stores wrapped/encrypted bytes. It cannot derive a
 * project key, a private key, or a secret's plaintext from what it holds.
 */

const RSA_ALG = { name: "RSA-OAEP", hash: "SHA-256" } as const;
const forgeOaepOptions = () => ({ md: forge.md.sha256.create(), mgf1: { md: forge.md.sha256.create() } });

/** One user's asymmetric identity. Generated once, on first vault unlock. */
export async function generateKeyPair(): Promise<VaultKeyPair> {
  if (hasSubtle()) {
    const pair = await crypto.subtle.generateKey(
      { ...RSA_ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
      true,
      ["wrapKey", "unwrapKey"],
    );
    return {
      publicKey: { kind: "native", key: pair.publicKey },
      privateKey: { kind: "native", key: pair.privateKey },
    };
  }
  // pure-JS 2048-bit RSA keygen takes a few seconds - only reached on plain
  // HTTP, and only once per account (the keypair is stored after this)
  const pair = await new Promise<forge.pki.rsa.KeyPair>((resolve, reject) => {
    forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001, workers: 0 }, (err, keypair) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve(keypair);
    });
  });
  return {
    publicKey: { kind: "forge", key: pair.publicKey },
    privateKey: { kind: "forge", key: pair.privateKey },
  };
}

export async function exportPublicKey(key: VaultPublicKey): Promise<string> {
  if (key.kind === "native") return toBase64(await crypto.subtle.exportKey("spki", key.key));
  return toBase64(fromForgeBinary(forge.asn1.toDer(forge.pki.publicKeyToAsn1(key.key)).getBytes()));
}

async function importPublicKey(b64: string): Promise<VaultPublicKey> {
  const der = fromBase64(b64);
  if (hasSubtle()) {
    const key = await crypto.subtle.importKey("spki", der as BufferSource, RSA_ALG, true, ["wrapKey"]);
    return { kind: "native", key };
  }
  const key = forge.pki.publicKeyFromAsn1(forge.asn1.fromDer(toForgeBinary(der)));
  return { kind: "forge", key };
}

/**
 * Encrypts the private key with the user's own personal vault key so it can
 * be stored server-side. Binary key bytes are base64'd first: `encrypt()`
 * round-trips text through TextEncoder/TextDecoder, which corrupts arbitrary
 * binary that isn't valid UTF-8 - base64 sidesteps that entirely.
 */
export async function wrapPrivateKeyForStorage(
  personalKey: VaultKey,
  privateKey: VaultPrivateKey,
): Promise<{ cipher: string; iv: string }> {
  const pkcs8 =
    privateKey.kind === "native"
      ? new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey.key))
      : fromForgeBinary(
          forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(privateKey.key))).getBytes(),
        );
  return encrypt(personalKey, toBase64(pkcs8));
}

export async function unwrapPrivateKeyFromStorage(
  personalKey: VaultKey,
  cipher: string,
  iv: string,
): Promise<VaultPrivateKey> {
  const pkcs8 = fromBase64(await decrypt(personalKey, cipher, iv));
  if (hasSubtle()) {
    const key = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, RSA_ALG, true, ["unwrapKey"]);
    return { kind: "native", key };
  }
  // privateKeyFromAsn1 accepts a PKCS#8 PrivateKeyInfo directly - it unwraps
  // the envelope on its own before parsing the RSA key inside
  const key = forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(toForgeBinary(pkcs8)));
  return { kind: "forge", key };
}

/** A fresh shared key for one project. Extractable, so it can be re-wrapped for later members. */
export async function generateProjectKey(): Promise<VaultKey> {
  if (hasSubtle()) {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    return { kind: "native", key };
  }
  return { kind: "forge", bytes: randomBytes(32) };
}

/**
 * Hands `projectKey` to one recipient by encrypting it with their public key.
 * `projectKey` and the imported recipient key always come from the same
 * `hasSubtle()` check in this same call, so they're always the same engine -
 * there's no cross-engine case to handle here (unwrapping below is the side
 * that actually crosses engines, since the sender and recipient can be on
 * different browsers).
 */
export async function wrapProjectKeyFor(
  projectKey: VaultKey,
  recipientPublicKeyB64: string,
): Promise<string> {
  const recipientKey = await importPublicKey(recipientPublicKeyB64);
  if (projectKey.kind === "native" && recipientKey.kind === "native") {
    const wrapped = await crypto.subtle.wrapKey("raw", projectKey.key, recipientKey.key, RSA_ALG);
    return toBase64(wrapped);
  }
  if (projectKey.kind === "forge" && recipientKey.kind === "forge") {
    const wrapped = recipientKey.key.encrypt(toForgeBinary(projectKey.bytes), "RSA-OAEP", forgeOaepOptions());
    return toBase64(fromForgeBinary(wrapped));
  }
  throw new Error("internal: 프로젝트 키와 공개키의 암호화 엔진이 다릅니다");
}

/** Opens a project key that was wrapped for this user, using their own private key. */
export async function unwrapProjectKey(
  wrappedKeyB64: string,
  privateKey: VaultPrivateKey,
): Promise<VaultKey> {
  const wrapped = fromBase64(wrappedKeyB64);
  if (privateKey.kind === "native") {
    const key = await crypto.subtle.unwrapKey(
      "raw",
      wrapped as BufferSource,
      privateKey.key,
      RSA_ALG,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    return { kind: "native", key };
  }
  const raw = privateKey.key.decrypt(toForgeBinary(wrapped), "RSA-OAEP", forgeOaepOptions());
  return { kind: "forge", bytes: fromForgeBinary(raw) };
}
