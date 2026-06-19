import type { Db } from "./database.js";
import { audit } from "./audit.js";

// Data export (access/portability). Returns the user's data across stores.
export async function exportUser(db: Db, userId: string) {
  const user = await db.get(
    `SELECT id, name, email, phone, claimed, marketing_consent, created_at FROM users WHERE id = ?`,
    [userId],
  );
  const bookings = await db.all(`SELECT * FROM bookings WHERE customer_user_id = ?`, [userId]);
  const bookingServices = await db.all(
    `SELECT bs.* FROM booking_services bs JOIN bookings b ON b.id = bs.booking_id WHERE b.customer_user_id = ?`,
    [userId],
  );
  const payments = await db.all(
    `SELECT id, booking_id, amount, method, status, created_at FROM payments WHERE customer_user_id = ?`,
    [userId],
  );
  const notifications = await db.all(
    `SELECT id, bucket, type, title, body, created_at FROM notifications WHERE user_id = ?`,
    [userId],
  );
  return { exportedAt: new Date().toISOString(), user, bookings, bookingServices, payments, notifications };
}

// Right to erasure. Wipes the user across EVERY store. FK ON DELETE CASCADE removes
// sessions, bookings (→ booking_services, payments), leads, notifications and owned
// orgs; OTPs (keyed by identifier) are cleared and the audit actor anonymised.
export async function deleteUser(db: Db, userId: string): Promise<{ deleted: true }> {
  const user = await db.get<{ email: string | null; phone: string | null }>(
    `SELECT email, phone FROM users WHERE id = ?`,
    [userId],
  );
  await db.tx(async (t) => {
    if (user?.email) await t.run(`DELETE FROM otps WHERE identifier = ?`, [user.email]);
    if (user?.phone) await t.run(`DELETE FROM otps WHERE identifier = ?`, [user.phone]);
    await t.run(`UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = ?`, [userId]);
    await t.run(`DELETE FROM users WHERE id = ?`, [userId]); // cascades the rest
  });
  await audit(db, { action: "user.deleted", targetType: "user", targetId: userId });
  return { deleted: true };
}
