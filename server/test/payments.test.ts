import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, ownerId, registerCustomer } from "./helpers.js";

async function bookWith(app: ReturnType<typeof freshApp>["app"], cookie: string, slug: string, time: string) {
  const p = await request(app).get(`/api/providers/${slug}`);
  const svc = p.body.services[0].id;
  const res = await request(app)
    .post("/api/bookings")
    .set("Cookie", cookie)
    .send({ providerSlug: slug, serviceIds: [svc], date: "2030-04-01", time });
  return res.body;
}

describe("payments — no-custody, gated, idempotent (I12, I14, I15, I20)", () => {
  it("an unverified provider cannot take an in-app payment by any path", async () => {
    const { app } = freshApp();
    const c = await registerCustomer(app, "p1@example.com");
    const booking = await bookWith(app, c.cookie, "hydro-hand-wash", "09:00"); // unverified
    const pay = await request(app).post(`/api/bookings/${booking.id}/pay`).set("Cookie", c.cookie).send({});
    expect(pay.status).toBe(403);
  });

  it("a verified provider takes payment with zero platform fee and no custody", async () => {
    const { app } = freshApp();
    const c = await registerCustomer(app, "p2@example.com");
    const booking = await bookWith(app, c.cookie, "jamies-mobile-valet", "10:00"); // verified
    const pay = await request(app)
      .post(`/api/bookings/${booking.id}/pay`)
      .set("Cookie", c.cookie)
      .send({ idempotencyKey: "key-1" });
    expect(pay.status).toBe(200);
    expect(pay.body.applicationFee).toBe(0); // no commission, ever
    expect(pay.body.status).toBe("requires_capture");
  });

  it("is idempotent — the same key never double-charges", async () => {
    const { app, db } = freshApp();
    const c = await registerCustomer(app, "p3@example.com");
    const booking = await bookWith(app, c.cookie, "jamies-mobile-valet", "11:00");
    const first = await request(app).post(`/api/bookings/${booking.id}/pay`).set("Cookie", c.cookie).send({ idempotencyKey: "same" });
    const second = await request(app).post(`/api/bookings/${booking.id}/pay`).set("Cookie", c.cookie).send({ idempotencyKey: "same" });
    expect(first.body.paymentId).toBe(second.body.paymentId);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM payments WHERE booking_id = ?`).get(booking.id) as { n: number };
    expect(count.n).toBe(1);
  });

  it("capture settles to the provider's connected account (platform balance stays zero)", async () => {
    const { app, db } = freshApp();
    const c = await registerCustomer(app, "p4@example.com");
    const booking = await bookWith(app, c.cookie, "jamies-mobile-valet", "12:00");
    const pay = await request(app).post(`/api/bookings/${booking.id}/pay`).set("Cookie", c.cookie).send({ idempotencyKey: "k" });

    const owner = ownerId(db, "jamies-mobile-valet");
    const cap = await request(app)
      .post(`/api/provider/payments/${pay.body.paymentId}/capture`)
      .set("Cookie", cookieFor(db, owner))
      .send({ idempotencyKey: "capk" });
    expect(cap.body.status).toBe("paid_out");

    const row = db.prepare(`SELECT destination_account, application_fee FROM payments WHERE id = ?`).get(pay.body.paymentId) as {
      destination_account: string;
      application_fee: number;
    };
    expect(row.destination_account).toContain("acct_"); // funds destined to provider, not platform
    expect(row.application_fee).toBe(0);
  });
});
