import type { DB } from "./db.js";
import { audit } from "./audit.js";

// Data export (access/portability). Returns the user's data across stores.
export function exportUser(db: DB, userId: string) {
  const user = db.prepare(`SELECT id, name, email, phone, claimed, marketing_consent, created_at FROM users WHERE id = ?`).get(userId);
  const bookings = db.prepare(`SELECT * FROM bookings WHERE customer_user_id = ?`).all(userId);
  const bookingServices = db
    .prepare(
      `SELECT bs.* FROM booking_services bs JOIN bookings b ON b.id = bs.booking_id WHERE b.customer_user_id = ?`,
    )
    .all(userId);
  const payments = db.prepare(`SELECT id, booking_id, amount, method, status, created_at FROM payments WHERE customer_user_id = ?`).all(userId);
  const notifications = db.prepare(`SELECT id, bucket, type, title, body, created_at FROM notifications WHERE user_id = ?`).all(userId);
  return {
    exportedAt: new Date().toISOString(),
    user,
    bookings,
    bookingServices,
    payments,
    notifications,
  };
}

// Right to erasure. Wipes the user across EVERY store, not just the main row.
// FK ON DELETE CASCADE removes sessions, bookings (→ booking_services, payments),
// leads, notifications and any owned orgs. We also clear OTPs (keyed by identifier)
// and anonymise the audit actor so the immutable log keeps no personal linkage.
export function deleteUser(db: DB, userId: string): { deleted: true } {
  const user = db.prepare(`SELECT email, phone FROM users WHERE id = ?`).get(userId) as
    | { email: string | null; phone: string | null }
    | undefined;
  const tx = db.transaction(() => {
    if (user?.email) db.prepare(`DELETE FROM otps WHERE identifier = ?`).run(user.email);
    if (user?.phone) db.prepare(`DELETE FROM otps WHERE identifier = ?`).run(user.phone);
    db.prepare(`UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = ?`).run(userId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId); // cascades the rest
  });
  tx();
  audit(db, { action: "user.deleted", targetType: "user", targetId: userId });
  return { deleted: true };
}
