/**
 * Server-side encryption for stored credentials.
 *
 * Values are encrypted with a key only the server holds, so a leaked database
 * dump or backup is useless on its own - but the server (and therefore anyone
 * who can read its environment) can decrypt them. That is a deliberate trade:
 * the earlier design encrypted in the browser under a master password, which
 * no one else could ever open, at the cost of a whole key-exchange layer just
 * to let two project members read the same entry. For dev credentials on a
 * private NAS that cost wasn't worth paying.
 *
 * The key comes from AUTH_SECRET rather than a variable of its own so existing
 * installs need no .env change. Consequence: rotating AUTH_SECRET (which also
 * invalidates sessions) makes every stored value unreadable.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  // AUTH_SECRET is a passphrase of any length; hash it down to the 32 bytes
  // AES-256 needs. The label keeps this key distinct from the same secret's
  // session-signing use.
  return createHash("sha256").update(`scvnote-secret-v1:${secret}`).digest();
}

/** Returns "iv:ciphertext:tag", each part base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, body, cipher.getAuthTag()].map((part) => part.toString("base64")).join(":");
}

export function decryptSecret(stored: string): string {
  const [iv, body, tag] = stored.split(":").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  // GCM authenticates, so a wrong key or tampered ciphertext throws here
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
