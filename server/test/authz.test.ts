import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, ownerId, registerCustomer } from "./helpers.js";

// Cross-tenant authorization: a provider must never act on another provider's resources,
// even with a valid session. Covers every provider :id endpoint.
describe("cross-tenant authorization (IDOR防)", () => {
  it("Provider A cannot capture/refund Provider B's payment, or change B's booking", async () => {
    const { app, db } = await freshApp();
    // a customer books + pays Provider B (jamies, verified)
    const cust = await registerCustomer(app, "x@example.com");
    const p = await request(app).get("/api/providers/jamies-mobile-valet");
    const booking = (await request(app).post("/api/bookings").set("Cookie", cust.cookie)
      .send({ providerSlug: "jamies-mobile-valet", serviceIds: [p.body.services[0].id], date: "2036-01-01", time: "10:00" })).body;
    const pay = (await request(app).post(`/api/bookings/${booking.id}/pay`).set("Cookie", cust.cookie).send({ idempotencyKey: "k1" })).body;

    // Provider A (a DIFFERENT org owner) tries to act on B's resources
    const aCookie = await cookieFor(db, await ownerId(db, "gleamworks-detailing"));

    const cap = await request(app).post(`/api/provider/payments/${pay.paymentId}/capture`).set("Cookie", aCookie).send({});
    expect(cap.status).toBe(403);
    const ref = await request(app).post(`/api/provider/payments/${pay.paymentId}/refund`).set("Cookie", aCookie).send({});
    expect(ref.status).toBe(403);
    const st = await request(app).post(`/api/provider/bookings/${booking.id}/status`).set("Cookie", aCookie).send({ status: "completed" });
    expect(st.status).toBe(403);
  });

  it("Provider A cannot remove Provider B's team member", async () => {
    const { app, db } = await freshApp();
    const bCookie = await cookieFor(db, await ownerId(db, "jamies-mobile-valet")); // growth: seats
    const member = (await request(app).post("/api/provider/team").set("Cookie", bCookie).send({ name: "Op", contact: "op@e.com" })).body;
    const aCookie = await cookieFor(db, await ownerId(db, "gleamworks-detailing"));
    const del = await request(app).delete(`/api/provider/team/${member.id}`).set("Cookie", aCookie);
    expect(del.status).toBe(404); // scoped to A's org → not found, never deleted
    const stillThere = await request(app).get("/api/provider/team").set("Cookie", bCookie);
    expect(stillThere.body.length).toBe(1);
  });

  it("a customer cannot review or apply credit to a booking that isn't theirs", async () => {
    const { app } = await freshApp();
    const a = await registerCustomer(app, "a2@example.com");
    const b = await registerCustomer(app, "b2@example.com");
    const p = await request(app).get("/api/providers/sparkle-on-wheels");
    const bk = (await request(app).post("/api/bookings").set("Cookie", a.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [p.body.services[0].id], date: "2036-02-02", time: "10:00" })).body;
    const rev = await request(app).post(`/api/bookings/${bk.id}/review`).set("Cookie", b.cookie).send({ rating: 1, text: "x" });
    expect(rev.status).toBe(404);
    const cr = await request(app).post(`/api/bookings/${bk.id}/apply-credit`).set("Cookie", b.cookie).send({});
    expect(cr.status).toBe(404);
  });

  it("a customer cannot reach any provider control-plane route", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "c3@example.com");
    for (const path of ["/api/provider/me", "/api/provider/subscription", "/api/provider/team", "/api/provider/hmrc", "/api/provider/copilot"]) {
      const r = await request(app).get(path).set("Cookie", c.cookie);
      expect(r.status).toBe(403);
    }
  });
});
