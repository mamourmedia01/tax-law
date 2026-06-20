import type { Db } from "./database.js";
import { ApiError, Errors, id, now } from "./lib.js";
import { audit } from "./audit.js";
import { TIERS, type Tier } from "./entitlements.js";

// --- ClientLink (referral attribution, FW26 §16.4) --------------------------
export async function connectClient(db: Db, customerUserId: string, slug: string) {
  const org = await db.get<{ id: string }>(`SELECT id FROM orgs WHERE slug = ?`, [slug]);
  if (!org) throw Errors.notFound("Provider not found");
  await db.run(
    `INSERT INTO client_links (org_id, customer_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    [org.id, customerUserId, now()],
  );
  await audit(db, { actorUserId: customerUserId, action: "clientlink.created", targetType: "org", targetId: org.id });
  return { linked: true };
}

export async function isClient(db: Db, orgId: string, customerUserId: string): Promise<boolean> {
  const r = await db.get(`SELECT 1 AS x FROM client_links WHERE org_id = ? AND customer_user_id = ?`, [orgId, customerUserId]);
  return !!r;
}

// --- Team / operative seats -------------------------------------------------
export async function listTeam(db: Db, orgId: string) {
  return db.all(`SELECT id, name, contact, role FROM org_members WHERE org_id = ? ORDER BY created_at`, [orgId]);
}

export async function inviteOperative(db: Db, orgId: string, tier: Tier, input: { name: string; contact: string }) {
  const cap = TIERS[tier].seats; // 1 / 6 / Infinity
  const seatsUsed = Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM org_members WHERE org_id = ?`, [orgId]))!.n);
  // seat 1 is the owner (implicit); members occupy the remaining seats
  if (cap !== Infinity && seatsUsed >= cap - 1) {
    throw new ApiError(409, "seat_cap_reached", `Your plan includes ${cap} seat${cap > 1 ? "s" : ""} — upgrade for more`);
  }
  const mid = id("mem");
  await db.run(`INSERT INTO org_members (id, org_id, name, contact, role, created_at) VALUES (?, ?, ?, ?, 'operative', ?)`, [
    mid, orgId, input.name, input.contact, now(),
  ]);
  await audit(db, { action: "team.invited", targetType: "org", targetId: orgId });
  return (await db.get(`SELECT id, name, contact, role FROM org_members WHERE id = ?`, [mid]))!;
}

export async function removeMember(db: Db, orgId: string, memberId: string) {
  const r = await db.run(`DELETE FROM org_members WHERE id = ? AND org_id = ?`, [memberId, orgId]);
  if (r.changes === 0) throw Errors.notFound("Member not found");
  return { deleted: true };
}

// --- HMRC / seller tax details ----------------------------------------------
export async function getTax(db: Db, orgId: string) {
  return (await db.get(`SELECT legal_name AS "legalName", tax_id AS "taxId", address FROM provider_tax WHERE org_id = ?`, [orgId])) ?? null;
}

export async function saveTax(db: Db, orgId: string, input: { legalName: string; taxId: string; address: string }) {
  await db.run(
    `INSERT INTO provider_tax (org_id, legal_name, tax_id, address, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id) DO UPDATE SET legal_name = excluded.legal_name, tax_id = excluded.tax_id, address = excluded.address, updated_at = excluded.updated_at`,
    [orgId, input.legalName, input.taxId, input.address, now(), now()],
  );
  // collecting tax details satisfies the HMRC verification step
  await db.run(`INSERT INTO verification (org_id) VALUES (?) ON CONFLICT DO NOTHING`, [orgId]);
  await db.run(`UPDATE verification SET hmrc_details = 1 WHERE org_id = ?`, [orgId]);
  await audit(db, { action: "tax.saved", targetType: "org", targetId: orgId });
  return { saved: true };
}
