import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, orgId, ownerId, registerCustomer } from "./helpers.js";

describe("GDPR export & erasure (I6)", () => {
  it("exports the user's data, then erases it across stores", async () => {
    const { app, db } = await freshApp();
    const c = await registerCustomer(app, "gdpr@example.com");
    const p = await request(app).get(`/api/providers/jamies-mobile-valet`);
    await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "jamies-mobile-valet", serviceIds: [p.body.services[0].id], date: "2030-05-01", time: "09:00" });

    const exp = await request(app).get("/api/account/export").set("Cookie", c.cookie);
    expect(exp.body.bookings.length).toBe(1);

    const del = await request(app).delete("/api/account").set("Cookie", c.cookie);
    expect(del.body.deleted).toBe(true);

    expect(Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE id = ?`, [c.user.id]))!.n)).toBe(0);
    expect(
      Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings WHERE customer_user_id = ?`, [c.user.id]))!.n),
    ).toBe(0);
    const orphan = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log WHERE actor_user_id = ?`, [c.user.id]);
    expect(Number(orphan!.n)).toBe(0);
  });
});

describe("storefront theming (I16, I17, I18)", () => {
  it("blocks a low-contrast theme from publishing", async () => {
    const { app, db } = await freshApp();
    const owner = await ownerId(db, "jamies-mobile-valet");
    const res = await request(app)
      .post("/api/provider/theme")
      .set("Cookie", await cookieFor(db, owner))
      .send({ tokens: { "brand.primary": "#EEEEEE", "brand.onPrimary": "#FFFFFF" } });
    expect(res.status).toBe(400);
  });

  it("publishes a compliant theme, scoped to the owner's org only", async () => {
    const { app, db } = await freshApp();
    const owner = await ownerId(db, "jamies-mobile-valet");
    const ok = await request(app)
      .post("/api/provider/theme")
      .set("Cookie", await cookieFor(db, owner))
      .send({ tokens: { "brand.primary": "#1A1A1A", "brand.onPrimary": "#FFFFFF" } });
    expect(ok.status).toBe(200);
    expect(ok.body.theme["brand.primary"]).toBe("#1A1A1A");

    const other = await orgId(db, "sparkle-on-wheels");
    const leak = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM theme_tokens WHERE org_id = ?`, [other]);
    expect(Number(leak!.n)).toBe(0);
  });
});

describe("AI copilot (I24, I25, I26, I29)", () => {
  it("is grounded, suggests-never-acts, and is tier-gated", async () => {
    const { app, db } = await freshApp();
    const soloOwner = await ownerId(db, "sparkle-on-wheels");
    const gated = await request(app).get("/api/provider/copilot").set("Cookie", await cookieFor(db, soloOwner));
    expect(gated.status).toBe(403);

    const growthOwner = await ownerId(db, "jamies-mobile-valet");
    const res = await request(app).get("/api/provider/copilot").set("Cookie", await cookieFor(db, growthOwner));
    expect(res.status).toBe(200);
    expect(res.body.grounded).toBe(true);
    expect(res.body.suggestNeverAct).toBe(true);
    for (const s of res.body.suggestions) expect(s.reason).toBeTruthy();
  });
});
