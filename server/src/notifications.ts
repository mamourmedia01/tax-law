import type { Db } from "./database.js";
import { id, now } from "./lib.js";

export type Bucket = "transactional" | "marketing";

// Two-bucket consent (I32): transactional always sends; marketing only with consent.
// Marketing/rebook nudges are double-gated (I33) — caller must also check provider mode.
export async function notify(
  db: Db,
  userId: string,
  n: { bucket: Bucket; type: string; title: string; body: string },
): Promise<boolean> {
  if (n.bucket === "marketing") {
    const u = await db.get<{ marketing_consent: number }>(
      `SELECT marketing_consent FROM users WHERE id = ?`,
      [userId],
    );
    if (!u?.marketing_consent) return false; // suppressed — no consent
  }
  await db.run(
    `INSERT INTO notifications (id, user_id, bucket, type, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id("ntf"), userId, n.bucket, n.type, n.title, n.body, now()],
  );
  return true;
}

export async function listNotifications(db: Db, userId: string) {
  return db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId]);
}
