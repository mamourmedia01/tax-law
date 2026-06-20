import crypto from "node:crypto";

// Application-level field encryption (defence-in-depth on top of disk/volume
// encryption-at-rest). AES-256-GCM with a key from ENCRYPTION_KEY (64 hex chars).
// Format: v1:<iv b64>:<tag b64>:<ciphertext b64>. If no key is set (dev), values
// pass through unchanged, and decrypt tolerates plaintext — so existing/seeded data
// keeps working while production encrypts new writes.

const PREFIX = "v1:";

function key(): Buffer | null {
  const k = process.env.ENCRYPTION_KEY ?? "";
  if (!k) return null;
  const buf = Buffer.from(k, "hex");
  return buf.length === 32 ? buf : null;
}

export function encryptField(plain: string | null): string | null {
  if (plain == null) return plain;
  const k = key();
  if (!k) return plain; // dev / no key → store as-is
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptField(stored: string | null): string | null {
  if (stored == null) return stored;
  if (!stored.startsWith(PREFIX)) return stored; // plaintext (dev / pre-encryption data)
  const k = key();
  if (!k) return stored;
  const [, ivB64, tagB64, ctB64] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

export function newEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
