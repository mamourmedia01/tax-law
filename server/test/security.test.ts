import { describe, it, expect, vi } from "vitest";
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

describe("#13 session cookie hardening", () => {
  it("sets an httpOnly, SameSite, Path=/ session cookie on verify", async () => {
    const { app } = await freshApp();
    const otp = await request(app).post("/api/auth/request-otp").send({ identifier: "cookie@example.com" });
    const v = await request(app).post("/api/auth/verify-otp").send({ identifier: "cookie@example.com", code: otp.body.devCode });
    const setCookie: string = v.headers["set-cookie"][0];
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i); // default same-origin posture
    expect(setCookie).toMatch(/Path=\//i);
  });

  it("logout clears the cookie with matching attributes so browsers honour it", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "logout@example.com");
    const out = await request(app).post("/api/auth/logout").set("Cookie", c.cookie);
    const cleared: string = out.headers["set-cookie"]?.[0] ?? "";
    expect(cleared).toMatch(/fp_session=;/i); // emptied
    expect(cleared).toMatch(/Path=\//i);
  });
});

describe("#13 production config assertions", () => {
  // config captures most env at import time, so re-import a fresh module per scenario.
  async function freshAssert(env: Record<string, string>) {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    vi.resetModules();
    try {
      const { assertProductionConfig } = await import("../src/lib.js");
      return () => assertProductionConfig();
    } finally {
      // restore after the dynamic import has captured env
      for (const k of Object.keys(env)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  }

  const good = {
    NODE_ENV: "production",
    SESSION_SECRET: "x".repeat(40),
    DATABASE_URL: "postgresql://db/x",
    ENCRYPTION_KEY: "a".repeat(64),
    CORS_ORIGIN: "https://app.fableplus.co.uk",
  };

  it("passes with a fully valid production config", async () => {
    expect(await freshAssert(good)).not.toThrow();
  });
  it("rejects localhost in CORS_ORIGIN", async () => {
    expect(await freshAssert({ ...good, CORS_ORIGIN: "http://localhost:5173" })).toThrow(/localhost/);
  });
  it("rejects a weak/default session secret", async () => {
    expect(await freshAssert({ ...good, SESSION_SECRET: "dev-only-change-me-please-32+chars" })).toThrow(/SESSION_SECRET/);
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
