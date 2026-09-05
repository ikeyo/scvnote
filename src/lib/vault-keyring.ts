/**
 * Orchestrates everything that has to happen right after a vault unlock:
 * make sure this account has an RSA keypair (generating one transparently
 * for a vault that predates project sharing), then fetch and unwrap every
 * project key this account has been handed. Pure crypto lives in
 * crypto-client.ts; this file is the part that also talks to the API.
 */
import {
  exportPublicKey,
  generateKeyPair,
  unwrapPrivateKeyFromStorage,
  unwrapProjectKey,
  wrapPrivateKeyForStorage,
  type VaultKey,
  type VaultPrivateKey,
} from "@/lib/crypto-client";

export type Keyring = {
  /** This account's own personal AES key - unchanged, still used for personal secrets. */
  personalKey: VaultKey;
  privateKey: VaultPrivateKey;
  publicKeyB64: string;
  /** projectId -> that project's shared AES key, already unwrapped. */
  projectKeys: Map<string, VaultKey>;
};

async function ensureKeyPair(
  personalKey: VaultKey,
): Promise<{ privateKey: VaultPrivateKey; publicKeyB64: string }> {
  const res = await fetch("/api/vault");
  const meta = await res.json();

  if (meta.publicKey && meta.privateKeyCipher && meta.privateKeyIv) {
    const privateKey = await unwrapPrivateKeyFromStorage(
      personalKey,
      meta.privateKeyCipher,
      meta.privateKeyIv,
    );
    return { privateKey, publicKeyB64: meta.publicKey as string };
  }

  // legacy vault (predates project sharing) - generate and upload now,
  // transparently, using the master password the caller just unlocked with
  const pair = await generateKeyPair();
  const publicKeyB64 = await exportPublicKey(pair.publicKey);
  const { cipher, iv } = await wrapPrivateKeyForStorage(personalKey, pair.privateKey);
  await fetch("/api/vault/keypair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey: publicKeyB64, privateKeyCipher: cipher, privateKeyIv: iv }),
  });
  return { privateKey: pair.privateKey, publicKeyB64 };
}

export async function establishKeyring(personalKey: VaultKey): Promise<Keyring> {
  const { privateKey, publicKeyB64 } = await ensureKeyPair(personalKey);

  const res = await fetch("/api/vault/shared-keys");
  const { keys } = (await res.json()) as { keys: { projectId: string; wrappedKey: string }[] };

  const projectKeys = new Map<string, VaultKey>();
  for (const { projectId, wrappedKey } of keys) {
    try {
      projectKeys.set(projectId, await unwrapProjectKey(wrappedKey, privateKey));
    } catch {
      // a corrupted/foreign-key row shouldn't take the whole vault down -
      // that one project's shared secrets just show as "키 없음" below
    }
  }

  return { personalKey, privateKey, publicKeyB64, projectKeys };
}
