import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, ownerId } from "./helpers.js";

describe("FW27 subscription billing", () => {
  it("changing plan updates the tier and the entitlement caps", async () => {
    const { app, db } = await freshApp();
    const owner = await ownerId(db, "sparkle-on-wheels"); // seeded as solo
    const cookie = await cookieFor(db, owner);

    const before = await request(app).get("/api/provider/me").set("Cookie", cookie);
    expect(before.body.entitlements.tier).toBe("solo");
    expect(before.body.entitlements.leads.cap).toBe(20);

    const up = await request(app).post("/api/provider/subscription").set("Cookie", cookie).send({ tier: "growth" });
    expect(up.status).toBe(200);
    expect(up.body.subscription.tier).toBe("growth");
    expect(up.body.subscription.price).toBe(117);

    const after = await request(app).get("/api/provider/me").set("Cookie", cookie);
    expect(after.body.entitlements.tier).toBe("growth");
    expect(after.body.entitlements.leads.cap).toBe(90); // caps moved with the plan

    const fleet = await request(app).post("/api/provider/subscription").set("Cookie", cookie).send({ tier: "fleet" });
    expect(fleet.body.subscription.tier).toBe("fleet");
    const fleetMe = await request(app).get("/api/provider/me").set("Cookie", cookie);
    expect(fleetMe.body.entitlements.leads.cap).toBeNull(); // unlimited
  });

  it("cancel sets status canceled", async () => {
    const { app, db } = await freshApp();
    const owner = await ownerId(db, "sparkle-on-wheels");
    const cookie = await cookieFor(db, owner);
    await request(app).post("/api/provider/subscription").set("Cookie", cookie).send({ tier: "solo" });
    const res = await request(app).post("/api/provider/subscription/cancel").set("Cookie", cookie).send({});
    expect(res.body.subscription.status).toBe("canceled");
  });
});

describe("FW28 payments — refund + payout speed", () => {
  async function payFor(app: Awaited<ReturnType<typeof freshApp>>["app"], db: Awaited<ReturnType<typeof freshApp>>["db"]) {
    const { registerCustomer } = await import("./helpers.js");
    const c = await registerCustomer(app, "refund@example.com");
    const p = await request(app).get(`/api/providers/jamies-mobile-valet`);
    const booking = await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "jamies-mobile-valet", serviceIds: [p.body.services[0].id], date: "2031-01-01", time: "10:00" });
    const pay = await request(app)
      .post(`/api/bookings/${booking.body.id}/pay`)
      .set("Cookie", c.cookie)
      .send({ idempotencyKey: "rk", payoutSpeed: "instant" });
    return { pay, db };
  }

  it("records payout speed and refunds (owner-gated, idempotent)", async () => {
    const { app, db } = await freshApp();
    const { pay } = await payFor(app, db);
    expect(pay.body.payoutSpeed).toBe("instant");

    const owner = await ownerId(db, "jamies-mobile-valet");
    const ocookie = await cookieFor(db, owner);
    const r1 = await request(app).post(`/api/provider/payments/${pay.body.paymentId}/refund`).set("Cookie", ocookie).send({ idempotencyKey: "rf" });
    const r2 = await request(app).post(`/api/provider/payments/${pay.body.paymentId}/refund`).set("Cookie", ocookie).send({ idempotencyKey: "rf" });
    expect(r1.body.status).toBe("refunded");
    expect(r2.body.status).toBe("refunded"); // idempotent
    const row = await db.get<{ status: string; payout_speed: string }>(`SELECT status, payout_speed FROM payments WHERE id = ?`, [pay.body.paymentId]);
    expect(row!.status).toBe("refunded");
    expect(row!.payout_speed).toBe("instant");
  });
});
