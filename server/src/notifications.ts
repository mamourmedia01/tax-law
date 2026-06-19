import type { DB } from "./db.js";
import { id, now } from "./lib.js";

export type Bucket = "transactional" | "marketing";

// Two-bucket consent (I32): transactional always sends; marketing only with consent.
// Marketing/rebook nudges are double-gated (I33) — caller must also check provider mode.
export function notify(
  db: DB,
  userId: string,
  n: { bucket: Bucket; type: string; title: string; body: string },
): boolean {
  if (n.bucket === "marketing") {
    const u = db.prepare(`SELECT marketing_consent FROM users WHERE id = ?`).get(userId) as
      | { marketing_consent: number }
      | undefined;
    if (!u?.marketing_consent) return false; // suppressed — no consent
  }
  db.prepare(
    `INSERT INTO notifications (id, user_id, bucket, type, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id("ntf"), userId, n.bucket, n.type, n.title, n.body, now());
  return true;
}

export function listNotifications(db: DB, userId: string) {
  return db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
    .all(userId);
}
