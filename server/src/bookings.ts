import type { Db } from "./database.js";
import { ApiError, Errors, id, now, ref } from "./lib.js";
import { audit } from "./audit.js";
import { clientCapReached, leadCapReached } from "./entitlements.js";
import type { Tier } from "./entitlements.js";
import { notify, type DeliveryChannel } from "./notifications.js";
import { haversineKm } from "./geo.js";

export type Source = "marketplace_lead" | "byoc_client";

interface OrgRow {
  id: string;
  owner_user_id: string;
  name: string;
  seed: string;
  tier: Tier;
  lat: number;
  lng: number;
  service_radius_km: number;
}

// Service-radius enforcement (B).
//
// Rule: if BOTH the provider has a positive service_radius_km AND the customer
// has a saved location (lat/lng), the booking is rejected when the customer is
// farther than the EFFECTIVE radius away. The effective radius is the per-client
// override for (org, customer) if one exists, else the provider's default radius.
//
// Graceful degradation: a customer with NO saved location is NOT blocked — we
// can't measure a distance we don't have, and hard-blocking every guest/legacy
// customer would break existing flows. Instead the customer is given a path to
// set their postcode (POST /api/account/location), after which enforcement
// applies. Provider-initiated bookings (own clients booked by the provider) are
// likewise not penalised when the client has no location on file.
async function enforceServiceRadius(db: Db, org: OrgRow, customerId: string): Promise<void> {
  if (!(org.service_radius_km > 0)) return; // provider hasn't constrained coverage
  const cust = await db.get<{ lat: number | null; lng: number | null }>(
    `SELECT lat, lng FROM users WHERE id = ?`,
    [customerId],
  );
  if (!cust || cust.lat == null || cust.lng == null) return; // no location yet → don't block

  const override = await db.get<{ radius_km: number }>(
    `SELECT radius_km FROM client_radius_overrides WHERE org_id = ? AND customer_user_id = ?`,
    [org.id, customerId],
  );
  const effective = override ? override.radius_km : org.service_radius_km;
  const distance = haversineKm({ lat: org.lat, lng: org.lng }, { lat: cust.lat, lng: cust.lng });
  if (distance > effective) {
    throw new ApiError(
      409,
      "out_of_range",
      `This provider covers up to ${Math.round(effective)} km; you're about ${Math.round(distance)} km away.`,
    );
  }
}

// unique-violation across both dialects (sqlite: SQLITE_CONSTRAINT*, pg: 23505)
function isUniqueViolation(e: unknown): boolean {
  const code = String((e as { code?: string }).code ?? "");
  return code.includes("CONSTRAINT") || code === "23505";
}

async function loadOrg(db: Db, orgId: string): Promise<OrgRow> {
  const o = await db.get<OrgRow>(
    `SELECT id, owner_user_id, name, seed, tier, lat, lng, service_radius_km FROM orgs WHERE id = ?`,
    [orgId],
  );
  if (!o) throw Errors.notFound("Provider not found");
  return o;
}

async function hasPriorBooking(db: Db, orgId: string, customerId: string): Promise<boolean> {
  const r = await db.get(`SELECT 1 AS x FROM bookings WHERE org_id = ? AND customer_user_id = ? LIMIT 1`, [
    orgId,
    customerId,
  ]);
  return !!r;
}

export interface CreateBookingInput {
  orgId: string;
  serviceIds: string[];
  date: string;
  time: string;
  source: Source;
  vehicleReg?: string;
  vehicleDesc?: string;
}

export async function createBooking(
  db: Db,
  actorUserId: string,
  input: CreateBookingInput,
  channels?: DeliveryChannel[],
) {
  const org = await loadOrg(db, input.orgId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw Errors.badRequest("Invalid date");
  if (!/^\d{2}:\d{2}$/.test(input.time)) throw Errors.badRequest("Invalid time");
  if (input.serviceIds.length === 0) throw Errors.badRequest("Choose at least one service");

  const placeholders = input.serviceIds.map(() => "?").join(",");
  const services = await db.all<{ id: string; name: string; price: number; duration_min: number }>(
    `SELECT * FROM services WHERE org_id = ? AND active = 1 AND id IN (${placeholders})`,
    [input.orgId, ...input.serviceIds],
  );
  if (services.length !== input.serviceIds.length) throw Errors.badRequest("Unknown service for this provider");

  // Service-radius gate (B): reject if the customer's known location is beyond the
  // provider's effective coverage. No-op when the customer has no saved location.
  await enforceServiceRadius(db, org, actorUserId);

  const total = services.reduce((s, x) => s + x.price, 0);
  const durationMin = services.reduce((s, x) => s + x.duration_min, 0);
  const isNewCustomer = !(await hasPriorBooking(db, input.orgId, actorUserId));

  // --- entitlement gates (server-side, I3) ---
  if (input.source === "marketplace_lead" && isNewCustomer && (await leadCapReached(db, org.id, org.tier))) {
    throw new ApiError(409, "lead_cap_reached", "This provider has reached their marketplace lead limit");
  }
  if (isNewCustomer && (await clientCapReached(db, org.id, org.tier))) {
    throw new ApiError(409, "client_cap_reached", "This provider has reached their client limit");
  }

  const bookingId = id("bkg");
  const bref = ref();

  try {
    await db.tx(async (t) => {
      await t.run(
        `INSERT INTO bookings (id, ref, org_id, customer_user_id, source, date, time, duration_min, total, status, pay_method, vehicle_reg, vehicle_desc, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'cash', ?, ?, ?)`,
        [bookingId, bref, org.id, actorUserId, input.source, input.date, input.time, durationMin, total, input.vehicleReg ?? null, input.vehicleDesc ?? null, now()],
      );
      for (const s of services) {
        await t.run(`INSERT INTO booking_services (booking_id, service_id, name, price) VALUES (?, ?, ?, ?)`, [
          bookingId,
          s.id,
          s.name,
          s.price,
        ]);
      }
      // Own-client bookings NEVER create a lead (I2): only marketplace introductions do.
      if (input.source === "marketplace_lead" && isNewCustomer) {
        await t.run(
          `INSERT INTO leads (org_id, customer_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
          [org.id, actorUserId, now()],
        );
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ApiError(409, "slot_taken", "That time has just been taken — pick another");
    throw e;
  }

  await audit(db, {
    actorUserId,
    action: "booking.created",
    targetType: "booking",
    targetId: bookingId,
    meta: { source: input.source, total, isNewCustomer },
  });

  await notify(db, actorUserId, {
    bucket: "transactional",
    type: "booking_confirmed",
    title: "Booking confirmed",
    body: `Your booking with ${org.name} is confirmed for ${input.date} at ${input.time}.`,
    channels,
  });
  await notify(db, org.owner_user_id, {
    bucket: "transactional",
    type: "new_booking",
    title: "New booking",
    body: `New ${input.source === "marketplace_lead" ? "marketplace" : "client"} booking for ${input.date} at ${input.time}.`,
    channels,
  });

  return getBooking(db, actorUserId, bookingId);
}

interface BookingRow {
  id: string;
  ref: string;
  org_id: string;
  org_name: string;
  slug: string;
  seed: string;
  customer_user_id: string;
  source: string;
  date: string;
  time: string;
  duration_min: number;
  total: number;
  status: string;
  pay_method: string;
  vehicle_reg: string | null;
  vehicle_desc: string | null;
  credit_applied: number;
  created_at: number;
}

const SELECT_BOOKING = `
  SELECT b.*, o.name AS org_name, o.slug AS slug, o.seed AS seed
  FROM bookings b JOIN orgs o ON o.id = b.org_id`;

async function shape(db: Db, b: BookingRow) {
  const svc = await db.all<{ name: string; price: number }>(
    `SELECT name, price FROM booking_services WHERE booking_id = ?`,
    [b.id],
  );
  return {
    id: b.id,
    ref: b.ref,
    orgId: b.org_id,
    providerName: b.org_name,
    providerSlug: b.slug,
    providerSeed: b.seed,
    source: b.source,
    date: b.date,
    time: b.time,
    durationMin: b.duration_min,
    total: b.total,
    status: b.status,
    payMethod: b.pay_method,
    vehicleReg: b.vehicle_reg,
    vehicleDesc: b.vehicle_desc,
    creditApplied: b.credit_applied,
    serviceNames: svc.map((s) => s.name),
    createdAt: b.created_at,
  };
}

export async function getBooking(db: Db, actorUserId: string, bookingId: string) {
  const b = await db.get<BookingRow>(`${SELECT_BOOKING} WHERE b.id = ?`, [bookingId]);
  if (!b) throw Errors.notFound("Booking not found");
  const org = await db.get<{ owner_user_id: string }>(`SELECT owner_user_id FROM orgs WHERE id = ?`, [b.org_id]);
  // tenancy: the booking's customer OR the provider owner may read it (deny-by-default)
  if (b.customer_user_id !== actorUserId && org?.owner_user_id !== actorUserId) throw Errors.notFound("Booking not found");
  return shape(db, b);
}

export async function listCustomerBookings(db: Db, actorUserId: string) {
  const rows = await db.all<BookingRow>(
    `${SELECT_BOOKING} WHERE b.customer_user_id = ? ORDER BY b.created_at DESC`,
    [actorUserId],
  );
  return Promise.all(rows.map((b) => shape(db, b)));
}

export async function cancelBooking(db: Db, actorUserId: string, bookingId: string) {
  const b = await db.get<BookingRow>(`${SELECT_BOOKING} WHERE b.id = ?`, [bookingId]);
  if (!b) throw Errors.notFound("Booking not found");
  const org = await db.get<{ owner_user_id: string }>(`SELECT owner_user_id FROM orgs WHERE id = ?`, [b.org_id]);
  if (b.customer_user_id !== actorUserId && org?.owner_user_id !== actorUserId) throw Errors.notFound("Booking not found");
  await db.run(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [bookingId]);
  await audit(db, { actorUserId, action: "booking.cancelled", targetType: "booking", targetId: bookingId });
  return getBooking(db, actorUserId, bookingId);
}

// Provider transitions a booking's status (owner-gated). confirmed → completed | no_show | cancelled.
export async function setBookingStatus(db: Db, ownerUserId: string, bookingId: string, status: "completed" | "no_show" | "cancelled") {
  const b = await db.get<{ org_id: string; status: string }>(`SELECT org_id, status FROM bookings WHERE id = ?`, [bookingId]);
  if (!b) throw Errors.notFound("Booking not found");
  const org = await db.get<{ owner_user_id: string }>(`SELECT owner_user_id FROM orgs WHERE id = ?`, [b.org_id]);
  if (!org || org.owner_user_id !== ownerUserId) throw Errors.forbidden();
  if (b.status !== "confirmed") throw new ApiError(409, "bad_state", `Booking is ${b.status}`);
  await db.run(`UPDATE bookings SET status = ? WHERE id = ?`, [status, bookingId]);
  await audit(db, { actorUserId: ownerUserId, action: "booking.status", targetType: "booking", targetId: bookingId, meta: { status } });
  return { id: bookingId, status };
}

// Customer leaves a review on a COMPLETED booking they own (one per booking). Recomputes org rating.
export async function addReview(db: Db, customerUserId: string, bookingId: string, rating: number, text: string) {
  if (rating < 1 || rating > 5) throw Errors.badRequest("Rating must be 1–5");
  const b = await db.get<{ org_id: string; customer_user_id: string; status: string }>(
    `SELECT org_id, customer_user_id, status FROM bookings WHERE id = ?`,
    [bookingId],
  );
  if (!b || b.customer_user_id !== customerUserId) throw Errors.notFound("Booking not found");
  if (b.status !== "completed") throw new ApiError(409, "not_completed", "You can review after the job is completed");
  const dupe = await db.get(`SELECT id FROM reviews WHERE booking_id = ?`, [bookingId]);
  if (dupe) throw new ApiError(409, "already_reviewed", "You've already reviewed this booking");
  const user = await db.get<{ name: string }>(`SELECT name FROM users WHERE id = ?`, [customerUserId]);
  const author = (user?.name?.trim() || "Customer").split(" ")[0] + ".";
  await db.tx(async (t) => {
    await t.run(
      `INSERT INTO reviews (id, org_id, booking_id, author, rating, text, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id("rev"), b.org_id, bookingId, author, rating, text.slice(0, 500), new Date().toISOString().slice(0, 10)],
    );
    const agg = (await t.get<{ avg: number; n: number }>(`SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE org_id = ?`, [b.org_id]))!;
    await t.run(`UPDATE orgs SET rating = ?, review_count = ? WHERE id = ?`, [Math.round(Number(agg.avg) * 10) / 10, Number(agg.n), b.org_id]);
  });
  await audit(db, { actorUserId: customerUserId, action: "review.created", targetType: "org", targetId: b.org_id, meta: { rating } });
  return { reviewed: true };
}

// Apply the customer's wallet credit to a booking (promotional credit; reduces what they pay).
export async function applyWalletCredit(db: Db, customerUserId: string, bookingId: string) {
  return db.tx(async (t) => {
    const b = await t.get<{ customer_user_id: string; total: number; credit_applied: number }>(
      `SELECT customer_user_id, total, credit_applied FROM bookings WHERE id = ?`,
      [bookingId],
    );
    if (!b || b.customer_user_id !== customerUserId) throw Errors.notFound("Booking not found");
    const u = (await t.get<{ wallet_balance: number }>(`SELECT wallet_balance FROM users WHERE id = ?`, [customerUserId]))!;
    const payable = b.total - b.credit_applied;
    const apply = Math.min(Number(u.wallet_balance), payable);
    if (apply <= 0) throw new ApiError(409, "no_credit", "No credit available to apply");
    await t.run(`UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?`, [apply, customerUserId]);
    await t.run(`UPDATE bookings SET credit_applied = credit_applied + ? WHERE id = ?`, [apply, bookingId]);
    return { applied: apply, payable: payable - apply };
  });
}

// Real availability from the DB: 08:00–18:00 in 30-min steps, minus taken slots.
export async function availability(db: Db, orgId: string, date: string) {
  await loadOrg(db, orgId);
  const rows = await db.all<{ time: string }>(
    `SELECT time FROM bookings WHERE org_id = ? AND date = ? AND status != 'cancelled'`,
    [orgId, date],
  );
  const taken = new Set(rows.map((r) => r.time));
  const slots: { time: string; available: boolean }[] = [];
  const today = new Date();
  const isToday =
    date === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  for (let h = 8; h <= 18; h++) {
    for (const m of [0, 30]) {
      const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const past = isToday && h * 60 + m <= today.getHours() * 60 + today.getMinutes();
      slots.push({ time, available: !taken.has(time) && !past });
    }
  }
  return slots;
}
