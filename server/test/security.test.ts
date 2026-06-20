import { describe, it, expect } from "vitest";
import request from "supertest";
import { freshApp, registerCustomer } from "./helpers.js";
import { totp, verifyTotp, newTotpSecret } from "../src/security.js";
import { ADMIN_EMAIL, ADMIN_TOTP_SECRET } from "../src/seed.js";

describe("FW34 TOTP 2FA", () => {
  it("generates and verifies a 6-digit code within the time window", () => {
    const secret = newTotpSecret();
    const code = totp(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });
});

describe("FW34 admin god-view (admin + 2FA gated, cross-tenant)", () => {
  async function adminCookie(app: Awaited<ReturnType<typeof freshApp>>["app"]) {
    const otp = await request(app).post("/api/auth/request-otp").send({ identifier: ADMIN_EMAIL });
    const v = await request(app).post("/api/auth/verify-otp").send({ identifier: ADMIN_EMAIL, code: otp.body.devCode });
    return v.headers["set-cookie"][0].split(";")[0];
  }

  it("rejects without a 2FA code, allows with a valid one", async () => {
    const { app } = await freshApp();
    const cookie = await adminCookie(app);
    const no2fa = await request(app).get("/api/admin/overview").set("Cookie", cookie);
    expect(no2fa.status).toBe(401);
    const ok = await request(app).get("/api/admin/overview").set("Cookie", cookie).set("x-admin-2fa", totp(ADMIN_TOTP_SECRET));
    expect(ok.status).toBe(200);
    expect(ok.body.orgs).toBeGreaterThan(0); // cross-tenant counts
  });

  it("a normal customer can never reach the god-view even with a code header", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "notadmin@example.com");
    const res = await request(app).get("/api/admin/overview").set("Cookie", c.cookie).set("x-admin-2fa", "123456");
    expect(res.status).toBe(403);
  });
});

describe("FW34 rate limiting", () => {
  it("throttles repeated auth requests", async () => {
    const { app } = await freshApp();
    let limited = false;
    for (let i = 0; i < 13; i++) {
      const r = await request(app).post("/api/auth/request-otp").send({ identifier: `rl${i}@example.com` });
      if (r.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});
