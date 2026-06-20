import { describe, it, expect } from "vitest";
import request from "supertest";
import { freshApp, registerCustomer } from "./helpers.js";
import { seasonalCampaign } from "../src/growth.js";
import { VERTICALS } from "../src/verticals.js";

describe("Wave 5 referrals", () => {
  it("credits both parties once; blocks self-referral and double-apply", async () => {
    const { app } = await freshApp();
    const ann = await registerCustomer(app, "ann@example.com");
    const myref = await request(app).get("/api/account/referral").set("Cookie", ann.cookie);
    const code = myref.body.code as string;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // self-referral blocked
    const self = await request(app).post("/api/referrals/apply").set("Cookie", ann.cookie).send({ code });
    expect(self.status).toBe(400);

    // a friend applies → both credited £5
    const ben = await registerCustomer(app, "ben@example.com");
    const applied = await request(app).post("/api/referrals/apply").set("Cookie", ben.cookie).send({ code });
    expect(applied.body.credited).toBe(5);
    const benWallet = await request(app).get("/api/account/wallet").set("Cookie", ben.cookie);
    expect(benWallet.body.balance).toBe(5);
    const annWallet = await request(app).get("/api/account/wallet").set("Cookie", ann.cookie);
    expect(annWallet.body.balance).toBe(5);

    // can't apply twice
    const again = await request(app).post("/api/referrals/apply").set("Cookie", ben.cookie).send({ code });
    expect(again.status).toBe(409);
  });
});

describe("Wave 5 seasonal engine", () => {
  it("returns a deterministic campaign per month", async () => {
    expect(seasonalCampaign(0).id).toBe("winter-salt");
    expect(seasonalCampaign(6).id).toBe("summer-shine");
    const { app } = await freshApp();
    const res = await request(app).get("/api/seasonal");
    expect(res.body.campaign.title).toBeTruthy();
    expect(Array.isArray(res.body.featured)).toBe(true);
  });
});

describe("Wave 5 public API (key-authenticated)", () => {
  it("requires a valid key and then returns the catalogue", async () => {
    const { app, db } = await freshApp();
    const { ownerId, cookieFor } = await import("./helpers.js");
    const owner = await ownerId(db, "jamies-mobile-valet");
    const key = await request(app).post("/api/provider/api-keys").set("Cookie", await cookieFor(db, owner)).send({ label: "test" });
    expect(key.body.key).toMatch(/^fpk_/);

    const noKey = await request(app).get("/api/v1/providers");
    expect(noKey.status).toBe(401);

    const withKey = await request(app).get("/api/v1/providers").set("Authorization", `Bearer ${key.body.key}`);
    expect(withKey.status).toBe(200);
    expect(withKey.body.length).toBeGreaterThan(0);

    const badKey = await request(app).get("/api/v1/providers").set("X-API-Key", "fpk_bogus");
    expect(badKey.status).toBe(401);
  });
});

describe("Wave 5 B2B + share card + verticals", () => {
  it("captures a fleet enquiry", async () => {
    const { app } = await freshApp();
    const res = await request(app).post("/api/b2b/enquiry").send({ name: "Acme", email: "ops@acme.com", fleetSize: 12 });
    expect(res.status).toBe(201);
    expect(res.body.received).toBe(true);
  });

  it("renders a branded SVG share card", async () => {
    const { app } = await freshApp();
    const res = await request(app).get("/api/providers/jamies-mobile-valet/share-card.svg");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    const svg = res.text || (Buffer.isBuffer(res.body) ? res.body.toString() : "");
    expect(svg).toContain("Fable+");
    expect(svg).toContain("Jamie");
  });

  it("ships a second vertical as pure config (vertical-agnostic core)", () => {
    expect(VERTICALS["car-care"]).toBeTruthy();
    expect(VERTICALS["home-cleaning"]).toBeTruthy();
    expect(VERTICALS["home-cleaning"].categories).toContain("End of tenancy");
  });

  it("the CORE never imports a vertical (FW26 invariant I1)", async () => {
    const fs = await import("node:fs");
    const url = await import("node:url");
    const core = ["bookings.ts", "payments.ts", "auth.ts", "entitlements.ts", "database.ts", "billing.ts"];
    for (const f of core) {
      const path = url.fileURLToPath(new URL(`../src/${f}`, import.meta.url));
      const src = fs.readFileSync(path, "utf8");
      expect(src.includes("verticals")).toBe(false);
    }
  });
});
