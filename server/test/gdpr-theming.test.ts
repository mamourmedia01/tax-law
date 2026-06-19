import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, orgId, ownerId, registerCustomer } from "./helpers.js";

describe("GDPR export & erasure (I6)", () => {
  it("exports the user's data, then erases it across stores", async () => {
    const { app, db } = freshApp();
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

    // user gone everywhere
    expect(db.prepare(`SELECT COUNT(*) AS n FROM users WHERE id = ?`).get(c.user.id)).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE customer_user_id = ?`).get(c.user.id)).toEqual({ n: 0 });
    // audit log retained but anonymised
    const orphan = db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE actor_user_id = ?`).get(c.user.id) as { n: number };
    expect(orphan.n).toBe(0);
  });
});

describe("storefront theming (I16, I17, I18)", () => {
  it("blocks a low-contrast theme from publishing", async () => {
    const { app, db } = freshApp();
    const owner = ownerId(db, "jamies-mobile-valet");
    const res = await request(app)
      .post("/api/provider/theme")
      .set("Cookie", cookieFor(db, owner))
      .send({ tokens: { "brand.primary": "#EEEEEE", "brand.onPrimary": "#FFFFFF" } });
    expect(res.status).toBe(400);
  });

  it("publishes a compliant theme, scoped to the owner's org only", async () => {
    const { app, db } = freshApp();
    const owner = ownerId(db, "jamies-mobile-valet");
    const ok = await request(app)
      .post("/api/provider/theme")
      .set("Cookie", cookieFor(db, owner))
      .send({ tokens: { "brand.primary": "#1A1A1A", "brand.onPrimary": "#FFFFFF" } });
    expect(ok.status).toBe(200);
    expect(ok.body.theme["brand.primary"]).toBe("#1A1A1A");

    // the token row is stored against this org and no other
    const other = orgId(db, "sparkle-on-wheels");
    const leak = db.prepare(`SELECT COUNT(*) AS n FROM theme_tokens WHERE org_id = ?`).get(other) as { n: number };
    expect(leak.n).toBe(0);
  });
});

describe("AI copilot (I24, I25, I26, I29)", () => {
  it("is grounded, suggests-never-acts, and is tier-gated", async () => {
    const { app, db } = freshApp();
    const soloOwner = ownerId(db, "sparkle-on-wheels"); // solo: no provider-suite AI
    const gated = await request(app).get("/api/provider/copilot").set("Cookie", cookieFor(db, soloOwner));
    expect(gated.status).toBe(403);

    const growthOwner = ownerId(db, "jamies-mobile-valet"); // growth: copilot available
    const res = await request(app).get("/api/provider/copilot").set("Cookie", cookieFor(db, growthOwner));
    expect(res.status).toBe(200);
    expect(res.body.grounded).toBe(true);
    expect(res.body.suggestNeverAct).toBe(true);
    for (const s of res.body.suggestions) expect(s.reason).toBeTruthy(); // explainable
  });
});
