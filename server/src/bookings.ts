import type { DB } from "./db.js";
import { ApiError, Errors, id, now, ref } from "./lib.js";
import { audit } from "./audit.js";
import { clientCapReached, leadCapReached } from "./entitlements.js";
import type { Tier } from "./entitlements.js";
import { notify } from "./notifications.js";

export type Source = "marketplace_lead" | "byoc_client";

interface OrgRow {
  id: string;
  owner_user_id: string;
  name: string;
  seed: string;
  tier: Tier;
}

function loadOrg(db: DB, orgId: string): OrgRow {
  const o = db.prepare(`SELECT id, owner_user_id, name, seed, tier FROM orgs WHERE id = ?`).get(orgId) as
    | OrgRow
    | undefined;
  if (!o) throw Errors.notFound("Provider not found");
  return o;
}

function hasPriorBooking(db: DB, orgId: string, customerId: string): boolean {
  const r = db
    .prepare(`SELECT 1 FROM bookings WHERE org_id = ? AND customer_user_id = ? LIMIT 1`)
    .get(orgId, customerId);
  return !!r;
}

export interface CreateBookingInput {
  orgId: string;
  serviceIds: string[];
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  source: Source;
}

export function createBooking(db: DB, actorUserId: string, input: CreateBookingInput) {
  const org = loadOrg(db, input.orgId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw Errors.badRequest("Invalid date");
  if (!/^\d{2}:\d{2}$/.test(input.time)) throw Errors.badRequest("Invalid time");

  // services must belong to this org (tenancy) and be active
  const placeholders = input.serviceIds.map(() => "?").join(",");
  if (input.serviceIds.length === 0) throw Errors.badRequest("Choose at least one service");
  const services = db
    .prepare(`SELECT * FROM services WHERE org_id = ? AND active = 1 AND id IN (${placeholders})`)
    .all(input.orgId, ...input.serviceIds) as { id: string; name: string; price: number; duration_min: number }[];
  if (services.length !== input.serviceIds.length) throw Errors.badRequest("Unknown service for this provider");

  const total = services.reduce((s, x) => s + x.price, 0);
  const durationMin = services.reduce((s, x) => s + x.duration_min, 0);

  const isNewCustomer = !hasPriorBooking(db, input.orgId, actorUserId);

  // --- entitlement gates (server-side, I3) ---
  // A marketplace booking from a brand-new customer consumes a LEAD.
  if (input.source === "marketplace_lead" && isNewCustomer && leadCapReached(db, org.id, org.tier)) {
    throw new ApiError(409, "lead_cap_reached", "This provider has reached their marketplace lead limit");
  }
  // A brand-new customer (any source) consumes a CLIENT slot.
  if (isNewCustomer && clientCapReached(db, org.id, org.tier)) {
    throw new ApiError(409, "client_cap_reached", "This provider has reached their client limit");
  }

  const bookingId = id("bkg");
  const bref = ref();

  const tx = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO bookings (id, ref, org_id, customer_user_id, source, date, time, duration_min, total, status, pay_method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'cash', ?)`,
      ).run(bookingId, bref, org.id, actorUserId, input.source, input.date, input.time, durationMin, total, now());
    } catch (e: unknown) {
      if (String((e as { code?: string }).code).includes("CONSTRAINT")) {
        throw new ApiError(409, "slot_taken", "That time has just been taken — pick another");
      }
      throw e;
    }
    const ins = db.prepare(`INSERT INTO booking_services (booking_id, service_id, name, price) VALUES (?, ?, ?, ?)`);
    for (const s of services) ins.run(bookingId, s.id, s.name, s.price);

    // Own-client bookings NEVER create a lead (I2): only marketplace introductions do.
    if (input.source === "marketplace_lead" && isNewCustomer) {
      db.prepare(`INSERT OR IGNORE INTO leads (org_id, customer_user_id, created_at) VALUES (?, ?, ?)`).run(
        org.id,
        actorUserId,
        now(),
      );
    }
  });
  tx();

  audit(db, {
    actorUserId,
    action: "booking.created",
    targetType: "booking",
    targetId: bookingId,
    meta: { source: input.source, total, isNewCustomer },
  });

  // transactional notifications to both parties (always sent — I32)
  notify(db, actorUserId, {
    bucket: "transactional",
    type: "booking_confirmed",
    title: "Booking confirmed",
    body: `Your booking with ${org.name} is confirmed for ${input.date} at ${input.time}.`,
  });
  notify(db, org.owner_user_id, {
    bucket: "transactional",
    type: "new_booking",
    title: "New booking",
    body: `New ${input.source === "marketplace_lead" ? "marketplace" : "client"} booking for ${input.date} at ${input.time}.`,
  });

  return getBooking(db, actorUserId, bookingId);
}

function shape(db: DB, b: BookingRow) {
  const svc = db.prepare(`SELECT name, price FROM booking_services WHERE booking_id = ?`).all(b.id) as {
    name: string;
    price: number;
  }[];
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
    serviceNames: svc.map((s) => s.name),
    createdAt: b.created_at,
  };
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
  created_at: number;
}

const SELECT_BOOKING = `
  SELECT b.*, o.name AS org_name, o.slug AS slug, o.seed AS seed
  FROM bookings b JOIN orgs o ON o.id = b.org_id`;

export function getBooking(db: DB, actorUserId: string, bookingId: string) {
  const b = db.prepare(`${SELECT_BOOKING} WHERE b.id = ?`).get(bookingId) as BookingRow | undefined;
  if (!b) throw Errors.notFound("Booking not found");
  // tenancy: the booking's customer OR the provider owner may read it (deny-by-default)
  const org = db.prepare(`SELECT owner_user_id FROM orgs WHERE id = ?`).get(b.org_id) as { owner_user_id: string };
  if (b.customer_user_id !== actorUserId && org.owner_user_id !== actorUserId) throw Errors.notFound("Booking not found");
  return shape(db, b);
}

export function listCustomerBookings(db: DB, actorUserId: string) {
  const rows = db
    .prepare(`${SELECT_BOOKING} WHERE b.customer_user_id = ? ORDER BY b.created_at DESC`)
    .all(actorUserId) as BookingRow[];
  return rows.map((b) => shape(db, b));
}

export function cancelBooking(db: DB, actorUserId: string, bookingId: string) {
  const b = db.prepare(`${SELECT_BOOKING} WHERE b.id = ?`).get(bookingId) as BookingRow | undefined;
  if (!b) throw Errors.notFound("Booking not found");
  const org = db.prepare(`SELECT owner_user_id FROM orgs WHERE id = ?`).get(b.org_id) as { owner_user_id: string };
  if (b.customer_user_id !== actorUserId && org.owner_user_id !== actorUserId) throw Errors.notFound("Booking not found");
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(bookingId);
  audit(db, { actorUserId, action: "booking.cancelled", targetType: "booking", targetId: bookingId });
  return getBooking(db, actorUserId, bookingId);
}

// Real availability from the DB: 08:00–18:00 in 30-min steps, minus taken slots.
export function availability(db: DB, orgId: string, date: string) {
  loadOrg(db, orgId);
  const taken = new Set(
    (
      db.prepare(`SELECT time FROM bookings WHERE org_id = ? AND date = ? AND status != 'cancelled'`).all(orgId, date) as {
        time: string;
      }[]
    ).map((r) => r.time),
  );
  const slots: { time: string; available: boolean }[] = [];
  const today = new Date();
  const isToday = date === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  for (let h = 8; h <= 18; h++) {
    for (const m of [0, 30]) {
      const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const past = isToday && h * 60 + m <= today.getHours() * 60 + today.getMinutes();
      slots.push({ time, available: !taken.has(time) && !past });
    }
  }
  return slots;
}
