import { describe, it, expect } from "vitest";
import request from "supertest";
import { freshApp, registerCustomer } from "./helpers.js";

describe("auth / OTP (I22, I23)", () => {
  it("issues a code and opens a session on verify", async () => {
    const { app } = freshApp();
    const { cookie, user } = await registerCustomer(app, "sam@example.com");
    expect(cookie).toContain("fp_session=");
    expect(user.claimed).toBe(false); // guest until claimed
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.body.user.id).toBe(user.id);
  });

  it("rejects an incorrect code", async () => {
    const { app } = freshApp();
    await request(app).post("/api/auth/request-otp").send({ identifier: "a@b.com" });
    const bad = await request(app).post("/api/auth/verify-otp").send({ identifier: "a@b.com", code: "000000" });
    expect(bad.status).toBe(400);
  });

  it("claims a guest account, preserving the same user id (guest data not lost)", async () => {
    const { app } = freshApp();
    const { cookie, user } = await registerCustomer(app, "claim@example.com");
    const claimed = await request(app)
      .patch("/api/account")
      .set("Cookie", cookie)
      .send({ name: "Sam Patel", marketing_consent: true });
    expect(claimed.body.user.id).toBe(user.id);
    expect(claimed.body.user.claimed).toBe(true);
    expect(claimed.body.user.marketingConsent).toBe(true);
  });

  it("requires auth for bookings (no account wall is bypassable)", async () => {
    const { app } = freshApp();
    const res = await request(app).get("/api/bookings");
    expect(res.status).toBe(401);
  });
});
