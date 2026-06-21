import type { Db } from "./database.js";
import { Errors } from "./lib.js";
import { audit } from "./audit.js";
import { geocodePostcode } from "./geo.js";

// ---------------------------------------------------------------------------
// Customer location + provider service-radius management.
// ---------------------------------------------------------------------------

// A provider's coverage radius. Below ~1 km is meaningless for a mobile service;
// above ~200 km is effectively "anywhere in the country" and likely a typo.
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 200;
// A per-client override is the "go anywhere for this named client" lever, so it
// permits a larger ceiling than the provider's blanket default radius.
const MAX_OVERRIDE_RADIUS_KM = 2000;

/** Customer sets/updates their saved location from a postcode. */
export async function setCustomerLocation(db: Db, userId: string, rawPostcode: string) {
  const geo = await geocodePostcode(rawPostcode); // validates + normalises + geocodes
  await db.run(`UPDATE users SET postcode = ?, lat = ?, lng = ? WHERE id = ?`, [
    geo.postcode,
    geo.lat,
    geo.lng,
    userId,
  ]);
  await audit(db, { actorUserId: userId, action: "account.location_set", targetType: "user", targetId: userId, meta: { postcode: geo.postcode, source: geo.source } });
  return { postcode: geo.postcode, lat: geo.lat, lng: geo.lng, source: geo.source };
}

/** Provider's saved location + default service radius (for display). */
export async function getCustomerLocation(db: Db, userId: string) {
  const u = await db.get<{ postcode: string | null; lat: number | null; lng: number | null }>(
    `SELECT postcode, lat, lng FROM users WHERE id = ?`,
    [userId],
  );
  return { postcode: u?.postcode ?? null, lat: u?.lat ?? null, lng: u?.lng ?? null };
}

function validRadius(radiusKm: number, max = MAX_RADIUS_KM): number {
  if (!Number.isFinite(radiusKm) || radiusKm < MIN_RADIUS_KM || radiusKm > max) {
    throw Errors.badRequest(`Service radius must be between ${MIN_RADIUS_KM} and ${max} km.`);
  }
  return Math.round(radiusKm * 10) / 10;
}

/** Provider sets their default service radius (km). */
export async function setServiceRadius(db: Db, orgId: string, ownerUserId: string, radiusKm: number) {
  const r = validRadius(radiusKm);
  await db.run(`UPDATE orgs SET service_radius_km = ? WHERE id = ?`, [r, orgId]);
  await audit(db, { actorUserId: ownerUserId, action: "provider.radius_set", targetType: "org", targetId: orgId, meta: { radiusKm: r } });
  return { radiusKm: r };
}

/**
 * Provider grants a specific client an EXTENDED (per-client) radius override.
 * Strictly scoped to the provider's own org — the caller passes the org id it
 * already resolved for the authenticated owner.
 */
export async function setClientRadiusOverride(
  db: Db,
  orgId: string,
  ownerUserId: string,
  customerUserId: string,
  radiusKm: number,
) {
  const r = validRadius(radiusKm, MAX_OVERRIDE_RADIUS_KM);
  const exists = await db.get(`SELECT id FROM users WHERE id = ?`, [customerUserId]);
  if (!exists) throw Errors.notFound("Client not found");
  await db.run(
    `INSERT INTO client_radius_overrides (org_id, customer_user_id, radius_km, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (org_id, customer_user_id) DO UPDATE SET radius_km = excluded.radius_km`,
    [orgId, customerUserId, r, Date.now()],
  );
  await audit(db, { actorUserId: ownerUserId, action: "provider.client_radius_set", targetType: "user", targetId: customerUserId, meta: { orgId, radiusKm: r } });
  return { customerUserId, radiusKm: r };
}

/** Provider removes a per-client radius override (own org only). */
export async function removeClientRadiusOverride(db: Db, orgId: string, ownerUserId: string, customerUserId: string) {
  const res = await db.run(`DELETE FROM client_radius_overrides WHERE org_id = ? AND customer_user_id = ?`, [
    orgId,
    customerUserId,
  ]);
  await audit(db, { actorUserId: ownerUserId, action: "provider.client_radius_removed", targetType: "user", targetId: customerUserId, meta: { orgId } });
  return { removed: res.changes > 0 };
}
