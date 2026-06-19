import { describe, it, expect } from "vitest";
import request from "supertest";
import { freshApp, orgId, registerCustomer, type App } from "./helpers.js";
import { createBooking } from "../src/bookings.js";
import { now } from "../src/lib.js";

async function firstService(app: App, slug: string) {
  const p = await request(app).get(`/api/providers/${slug}`);
  return p.body.services[0].id as string;
}

describe("booking engine (I2, I3)", () => {
  it("tags marketplace bookings with source = marketplace_lead", async () => {
    const { app, db } = await freshApp();
    const c = await registerCustomer(app, "m1@example.com");
    const svc = await firstService(app, "jamies-mobile-valet");
    const res = await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "jamies-mobile-valet", serviceIds: [svc], date: "2030-02-01", time: "09:00" });
    expect(res.status).toBe(201);
    const row = await db.get<{ source: string }>(`SELECT source FROM bookings WHERE id = ?`, [res.body.id]);
    expect(row!.source).toBe("marketplace_lead");
  });

  it("prevents double-booking the same slot", async () => {
    const { app } = await freshApp();
    const a = await registerCustomer(app, "m2@example.com");
    const b = await registerCustomer(app, "m3@example.com");
    const svc = await firstService(app, "sparkle-on-wheels");
    const first = await request(app)
      .post("/api/bookings")
      .set("Cookie", a.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [svc], date: "2030-02-02", time: "12:00" });
    expect(first.status).toBe(201);
    const clash = await request(app)
      .post("/api/bookings")
      .set("Cookie", b.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [svc], date: "2030-02-02", time: "12:00" });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("slot_taken");
  });

  it("enforces the marketplace lead cap server-side, but never caps own-client bookings", async () => {
    const { app, db } = await freshApp();
    const org = await orgId(db, "sparkle-on-wheels"); // solo tier: 20 leads/month
    for (let i = 0; i < 20; i++) {
      await db.run(`INSERT INTO users (id, phone, created_at) VALUES (?, ?, ?)`, [`u${i}`, `lead-${i}`, now()]);
      await db.run(`INSERT INTO leads (org_id, customer_user_id, created_at) VALUES (?, ?, ?)`, [org, `u${i}`, now()]);
    }
    const svc = (await db.get<{ id: string }>(`SELECT id FROM services WHERE org_id = ? LIMIT 1`, [org]))!.id;

    const newCust = await registerCustomer(app, "capped@example.com");
    const blocked = await request(app)
      .post("/api/bookings")
      .set("Cookie", newCust.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [svc], date: "2030-03-01", time: "08:00" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("lead_cap_reached");

    await db.run(`INSERT INTO users (id, phone, created_at) VALUES ('client-x', 'client-x', ?)`, [now()]);
    const ok = await createBooking(db, "client-x", {
      orgId: org,
      serviceIds: [svc],
      date: "2030-03-02",
      time: "08:00",
      source: "byoc_client",
    });
    expect(ok.source).toBe("byoc_client");
    const leadCount = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM leads WHERE org_id = ?`, [org]);
    expect(Number(leadCount!.n)).toBe(20);
  });
});
