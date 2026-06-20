import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { Db } from "./database.js";
import { Errors, id, now, sha256 } from "./lib.js";
import { audit } from "./audit.js";

// FW-ops public API: partner-facing, API-key authenticated, read-only catalogue.
// Only a hash of the key is stored; the plaintext is shown once at creation.

export async function issueApiKey(db: Db, orgId: string | null, label: string) {
  const raw = `fpk_${crypto.randomBytes(24).toString("hex")}`;
  await db.run(`INSERT INTO api_keys (id, key_hash, org_id, label, created_at) VALUES (?, ?, ?, ?, ?)`, [
    id("apik"),
    sha256(raw),
    orgId,
    label,
    now(),
  ]);
  await audit(db, { action: "apikey.issued", targetType: "org", targetId: orgId ?? undefined, meta: { label } });
  return { key: raw, label }; // shown once
}

// Express middleware: require a valid API key (header Authorization: Bearer fpk_… or X-API-Key).
export function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  const header = (req.headers["authorization"] as string)?.replace(/^Bearer\s+/i, "") || (req.headers["x-api-key"] as string);
  if (!header) throw Errors.unauthorized("API key required");
  // verification happens in the handler (needs async db); attach the hash for lookup
  (req as Request & { apiKeyHash?: string }).apiKeyHash = sha256(header);
  next();
}

export async function validateApiKey(db: Db, hash: string | undefined): Promise<boolean> {
  if (!hash) return false;
  const row = await db.get<{ id: string }>(`SELECT id FROM api_keys WHERE key_hash = ?`, [hash]);
  if (!row) return false;
  await db.run(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`, [now(), row.id]);
  return true;
}
