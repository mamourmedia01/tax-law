import type { Db } from "./database.js";
import { id, now } from "./lib.js";

// Append-only audit trail. Callers must pass ONLY non-sensitive metadata
// (ids, counts, statuses) — never names, emails, phones, card or KYC data (I6/I36).
export async function audit(
  db: Db,
  entry: {
    actorUserId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await db.run(
    `INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id("aud"),
      entry.actorUserId ?? null,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      now(),
    ],
  );
}
