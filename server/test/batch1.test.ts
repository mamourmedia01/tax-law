import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, ownerId, registerCustomer, type App } from "./helpers.js";

async function book(app: App, cookie: string, slug: string, time: string) {
  const p = await request(app).get(`/api/providers/${slug}`);
  const r = await request(app).post("/api/bookings").set("Cookie", cookie)
    .send({ providerSlug: slug, serviceIds: [p.body.services[0].id], date: "2034-01-01", time });
  return r.body;
}

describe("My Garage", () => {
  it("adds, lists and removes a vehicle (DVSA-enriched)", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "garage@example.com");
    const add = await request(app).post("/api/garage").set("Cookie", c.cookie).send({ reg: "AB12 CDE" });
    expect(add.status).toBe(201);
    expect(add.body.make).toBeTruthy();
    const list = await request(app).get("/api/garage").set("Cookie", c.cookie);
    expect(list.body.length).toBe(1);
    const dupe = await request(app).post("/api/garage").set("Cookie", c.cookie).send({ reg: "ab12cde" });
    expect(dupe.status).toBe(409);
    const del = await request(app).delete(`/api/garage/${add.body.id}`).set("Cookie", c.cookie);
    expect(del.body.deleted).toBe(true);
  });
});

describe("Booking lifecycle + reviews", () => {
  it("provider completes a booking, customer reviews it, org rating recomputes", async () => {
    const { app, db } = await freshApp();
    const c = await registerCustomer(app, "rev@example.com");
    const booking = await book(app, c.cookie, "sparkle-on-wheels", "09:00");

    // can't review before completion
    const early = await request(app).post(`/api/bookings/${booking.id}/review`).set("Cookie", c.cookie).send({ rating: 5, text: "great" });
    expect(early.status).toBe(409);

    const owner = await ownerId(db, "sparkle-on-wheels");
    const done = await request(app).post(`/api/provider/bookings/${booking.id}/status`).set("Cookie", await cookieFor(db, owner)).send({ status: "completed" });
    expect(done.body.status).toBe("completed");

    const review = await request(app).post(`/api/bookings/${booking.id}/review`).set("Cookie", c.cookie).send({ rating: 5, text: "Spotless, on time." });
    expect(review.body.reviewed).toBe(true);

    // one review per booking
    const dupe = await request(app).post(`/api/bookings/${booking.id}/review`).set("Cookie", c.cookie).send({ rating: 4, text: "again" });
    expect(dupe.status).toBe(409);

    const detail = await request(app).get("/api/providers/sparkle-on-wheels");
    expect(detail.body.reviews.some((r: { text: string }) => r.text === "Spotless, on time.")).toBe(true);
  });
});

describe("Wallet credit at checkout", () => {
  it("applies gift-card credit to a booking", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "wal@example.com");
    const card = await request(app).post("/api/giftcards").set("Cookie", c.cookie).send({ amount: 50 });
    await request(app).post("/api/giftcards/redeem").set("Cookie", c.cookie).send({ code: card.body.code });
    const booking = await book(app, c.cookie, "jamies-mobile-valet", "09:00"); // £35 service
    const applied = await request(app).post(`/api/bookings/${booking.id}/apply-credit`).set("Cookie", c.cookie).send({});
    expect(applied.body.applied).toBe(35); // capped at the booking total
    expect(applied.body.payable).toBe(0);
    const wallet = await request(app).get("/api/account/wallet").set("Cookie", c.cookie);
    expect(wallet.body.balance).toBe(15); // 50 - 35
  });
});

describe("Fully booked", () => {
  it("marks the storefront marketplaceFull when the lead cap is reached", async () => {
    const { app, db } = await freshApp();
    const o = (await db.get<{ id: string }>(`SELECT id FROM orgs WHERE slug='sparkle-on-wheels'`))!.id; // solo cap 20
    const { now } = await import("../src/lib.js");
    for (let i = 0; i < 20; i++) {
      await db.run(`INSERT INTO users (id, phone, created_at) VALUES (?, ?, ?)`, [`lu${i}`, `lead${i}`, now()]);
      await db.run(`INSERT INTO leads (org_id, customer_user_id, created_at) VALUES (?, ?, ?)`, [o, `lu${i}`, now()]);
    }
    const detail = await request(app).get("/api/providers/sparkle-on-wheels");
    expect(detail.body.marketplaceFull).toBe(true);
  });
});
