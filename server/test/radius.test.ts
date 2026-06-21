import { describe, it, expect } from "vitest";
import request from "supertest";
import { freshApp, orgId, ownerId, cookieFor, registerCustomer, type App } from "./helpers.js";
import type { Db } from "../src/database.js";

async function firstService(app: App, slug: string) {
  const p = await request(app).get(`/api/providers/${slug}`);
  return p.body.services[0].id as string;
}

// Pin a provider's org to a fixed location + radius so distance maths is exact.
async function pinProvider(db: Db, slug: string, lat: number, lng: number, radiusKm: number) {
  const org = await orgId(db, slug);
  await db.run(`UPDATE orgs SET lat = ?, lng = ?, service_radius_km = ? WHERE id = ?`, [lat, lng, radiusKm, org]);
  return org;
}

// Give a customer a fixed saved location.
async function pinCustomer(db: Db, userId: string, lat: number, lng: number) {
  await db.run(`UPDATE users SET lat = ?, lng = ? WHERE id = ?`, [lat, lng, userId]);
}

const LONDON = { lat: 51.5074, lng: -0.1278 };
const PARIS = { lat: 48.8566, lng: 2.3522 }; // ~343 km from London

describe("service radius enforcement (B)", () => {
  it("ALLOWS a booking when the customer is inside the provider radius", async () => {
    const { app, db } = await freshApp();
    await pinProvider(db, "sparkle-on-wheels", LONDON.lat, LONDON.lng, 50);
    const c = await registerCustomer(app, "near@example.com");
    await pinCustomer(db, c.user.id, LONDON.lat + 0.01, LONDON.lng + 0.01); // ~1.3 km
    const svc = await firstService(app, "sparkle-on-wheels");
    const res = await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [svc], date: "2030-04-01", time: "09:00" });
    expect(res.status).toBe(201);
  });

  it("REJECTS a booking when the customer is outside the provider radius", async () => {
    const { app, db } = await freshApp();
    await pinProvider(db, "sparkle-on-wheels", LONDON.lat, LONDON.lng, 15);
    const c = await registerCustomer(app, "far@example.com");
    await pinCustomer(db, c.user.id, PARIS.lat, PARIS.lng);
    const svc = await firstService(app, "sparkle-on-wheels");
    const res = await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [svc], date: "2030-04-02", time: "10:00" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("out_of_range");
    expect(res.body.error.message).toMatch(/covers up to 15 km/);
    expect(res.body.error.message).toMatch(/km away/);
  });

  it("does NOT block a customer who has no saved location (graceful path)", async () => {
    const { app, db } = await freshApp();
    await pinProvider(db, "sparkle-on-wheels", LONDON.lat, LONDON.lng, 1);
    const c = await registerCustomer(app, "noloc@example.com"); // no lat/lng set
    const svc = await firstService(app, "sparkle-on-wheels");
    const res = await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [svc], date: "2030-04-03", time: "11:00" });
    expect(res.status).toBe(201);
  });

  it("ALLOWS a booking beyond the default radius when a per-client override grants it", async () => {
    const { app, db } = await freshApp();
    const org = await pinProvider(db, "sparkle-on-wheels", LONDON.lat, LONDON.lng, 15);
    const owner = await ownerId(db, "sparkle-on-wheels");
    const c = await registerCustomer(app, "vip@example.com");
    await pinCustomer(db, c.user.id, PARIS.lat, PARIS.lng); // ~343 km away
    const svc = await firstService(app, "sparkle-on-wheels");

    // Without the override → rejected.
    const blocked = await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [svc], date: "2030-04-04", time: "12:00" });
    expect(blocked.status).toBe(409);

    // Provider grants an extended radius for this specific client.
    const grant = await request(app)
      .post(`/api/provider/clients/${c.user.id}/radius`)
      .set("Cookie", await cookieFor(db, owner))
      .send({ radiusKm: 500 });
    expect(grant.status).toBe(200);
    const ov = await db.get<{ radius_km: number }>(
      `SELECT radius_km FROM client_radius_overrides WHERE org_id = ? AND customer_user_id = ?`,
      [org, c.user.id],
    );
    expect(ov!.radius_km).toBe(500);

    // Now the same far customer can book.
    const ok = await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [svc], date: "2030-04-05", time: "13:00" });
    expect(ok.status).toBe(201);
  });

  it("per-client overrides are tenant-scoped (provider A cannot set provider B's override)", async () => {
    const { app, db } = await freshApp();
    const orgA = await orgId(db, "sparkle-on-wheels");
    const orgB = await orgId(db, "gleamworks-detailing");
    const ownerA = await ownerId(db, "sparkle-on-wheels");
    const c = await registerCustomer(app, "scoped@example.com");

    // Provider A grants an override — it lands ONLY under A's org.
    const res = await request(app)
      .post(`/api/provider/clients/${c.user.id}/radius`)
      .set("Cookie", await cookieFor(db, ownerA))
      .send({ radiusKm: 99 });
    expect(res.status).toBe(200);

    const underA = await db.get(
      `SELECT 1 AS x FROM client_radius_overrides WHERE org_id = ? AND customer_user_id = ?`,
      [orgA, c.user.id],
    );
    const underB = await db.get(
      `SELECT 1 AS x FROM client_radius_overrides WHERE org_id = ? AND customer_user_id = ?`,
      [orgB, c.user.id],
    );
    expect(underA).toBeTruthy();
    expect(underB).toBeFalsy();
  });

  it("rejects an out-of-range service radius value", async () => {
    const { app, db } = await freshApp();
    const owner = await ownerId(db, "sparkle-on-wheels");
    const res = await request(app)
      .post("/api/provider/radius")
      .set("Cookie", await cookieFor(db, owner))
      .send({ radiusKm: 9999 });
    expect(res.status).toBe(400);
  });

  it("customer can set their location from a postcode (normalised + geocoded)", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "pc@example.com");
    const res = await request(app)
      .post("/api/account/location")
      .set("Cookie", c.cookie)
      .send({ postcode: "sw1a1aa" });
    expect(res.status).toBe(200);
    expect(res.body.postcode).toBe("SW1A 1AA");
    expect(["postcodes_io", "sandbox"]).toContain(res.body.source);
    expect(typeof res.body.lat).toBe("number");
  });

  it("rejects a malformed postcode with a correctable message", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "badpc@example.com");
    const res = await request(app)
      .post("/api/account/location")
      .set("Cookie", c.cookie)
      .send({ postcode: "ZZZZZ" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/UK postcode/);
  });
});
