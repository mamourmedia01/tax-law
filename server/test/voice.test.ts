import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, ownerId } from "./helpers.js";

describe("FW32 voice receptionist — governed (I25, I27, I28) + tier-gated", () => {
  it("is gated below the Fleet plan", async () => {
    const { app, db } = await freshApp();
    const growthOwner = await ownerId(db, "jamies-mobile-valet"); // growth
    const res = await request(app)
      .post("/api/provider/voice/receptionist")
      .set("Cookie", await cookieFor(db, growthOwner))
      .send({ message: "Can I book a wash today?" });
    expect(res.status).toBe(403);
  });

  it("answers grounded in the org's own data and only PROPOSES a booking (never creates one)", async () => {
    const { app, db } = await freshApp();
    const fleetOwner = await ownerId(db, "gleamworks-detailing"); // fleet
    const before = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings`);

    const res = await request(app)
      .post("/api/provider/voice/receptionist")
      .set("Cookie", await cookieFor(db, fleetOwner))
      .send({ message: "Can I book an appointment today?" });

    expect(res.status).toBe(200);
    expect(res.body.grounded).toBe(true);
    expect(res.body.audioBase64.length).toBeGreaterThan(0); // TTS produced audio (sandbox WAV)
    // suggest-never-act: a proposal may be returned, but NO booking is created and no payment occurs
    if (res.body.proposal) {
      expect(res.body.proposal).toHaveProperty("time");
      expect(res.body.proposal).not.toHaveProperty("paymentId");
    }
    const after = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings`);
    expect(Number(after!.n)).toBe(Number(before!.n)); // nothing booked by the AI
    const payments = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM payments`);
    expect(Number(payments!.n)).toBe(0); // AI never moved money
  });
});
