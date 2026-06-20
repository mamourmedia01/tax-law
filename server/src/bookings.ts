import type { Db } from "./database.js";
import { ApiError, Errors, id, now, ref } from "./lib.js";
import { audit } from "./audit.js";
import { clientCapReached, leadCapReached } from "./entitlements.js";
import type { Tier } from "./entitlements.js";
import { notify, type DeliveryChannel } from "./notifications.js";

export type Source = "marketplace_lead" | "byoc_client";

interface OrgRow {
  id: string;
  owner_user_id: string;
  name: string;
  seed: string;
  tier: Tier;
}

// unique-violation across both dialects (sqlite: SQLITE_CONSTRAINT*, pg: 23505)
function isUniqueViolation(e: unknown): boolean {
  const code = String((e as { code?: string }).code ?? "");
  return code.includes("CONSTRAINT") || code === "23505";
}

async function loadOrg(db: Db, orgId: string): Promise<OrgRow> {
  const o = await db.get<OrgRow>(`SELECT id, owner_user_id, name, seed, tier FROM orgs WHERE id = ?`, [orgId]);
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
        `INSERT INTO bookings (id, ref, org_id, customer_user_id, source, date, time, duration_min, total, status, pay_method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'cash', ?)`,
        [bookingId, bref, org.id, actorUserId, input.source, input.date, input.time, durationMin, total, now()],
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
