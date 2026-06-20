import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, ownerId, registerCustomer, type App } from "./helpers.js";

async function svc(app: App, slug: string) {
  const p = await request(app).get(`/api/providers/${slug}`);
  return p.body.services[0].id as string;
}

describe("Referral attribution (ClientLink)", () => {
  it("a linked client books as byoc_client and consumes no marketplace lead", async () => {
    const { app, db } = await freshApp();
    const c = await registerCustomer(app, "linked@example.com");
    const s = await svc(app, "jamies-mobile-valet");

    await request(app).post("/api/providers/jamies-mobile-valet/connect").set("Cookie", c.cookie).send({});
    const b = await request(app).post("/api/bookings").set("Cookie", c.cookie)
      .send({ providerSlug: "jamies-mobile-valet", serviceIds: [s], date: "2035-01-01", time: "09:00" });
    expect(b.status).toBe(201);
    expect(b.body.source).toBe("byoc_client");

    const org = (await db.get<{ id: string }>(`SELECT id FROM orgs WHERE slug='jamies-mobile-valet'`))!.id;
    const leads = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM leads WHERE org_id = ?`, [org]);
    expect(Number(leads!.n)).toBe(0); // no marketplace lead consumed (I2)
  });

  it("a non-linked customer books as marketplace_lead", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "organic@example.com");
    const s = await svc(app, "jamies-mobile-valet");
    const b = await request(app).post("/api/bookings").set("Cookie", c.cookie)
      .send({ providerSlug: "jamies-mobile-valet", serviceIds: [s], date: "2035-02-01", time: "09:00" });
    expect(b.body.source).toBe("marketplace_lead");
  });
});

describe("Recurring bookings", () => {
  it("creates weekly occurrences", async () => {
    const { app, db } = await freshApp();
    const c = await registerCustomer(app, "recur@example.com");
    const s = await svc(app, "sparkle-on-wheels");
    const b = await request(app).post("/api/bookings").set("Cookie", c.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [s], date: "2035-03-04", time: "09:00", recurrence: { interval: 1, count: 4 } });
    expect(b.status).toBe(201);
    expect(b.body.recurringCreated).toBe(3); // first + 3 more = 4
    const org = (await db.get<{ id: string }>(`SELECT id FROM orgs WHERE slug='sparkle-on-wheels'`))!.id;
    const n = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings WHERE org_id = ? AND customer_user_id = ?`, [org, c.user.id]);
    expect(Number(n!.n)).toBe(4);
  });
});

describe("Team / operative seats", () => {
  it("enforces the seat cap by tier", async () => {
    const { app, db } = await freshApp();
    const solo = await cookieFor(db, await ownerId(db, "sparkle-on-wheels")); // solo: 1 seat (owner only)
    const r = await request(app).post("/api/provider/team").set("Cookie", solo).send({ name: "Op One", contact: "op1@e.com" });
    expect(r.status).toBe(409); // no spare seats on Solo

    const growth = await cookieFor(db, await ownerId(db, "jamies-mobile-valet")); // growth: 6 seats
    const ok = await request(app).post("/api/provider/team").set("Cookie", growth).send({ name: "Op One", contact: "op1@e.com" });
    expect(ok.status).toBe(201);
    const team = await request(app).get("/api/provider/team").set("Cookie", growth);
    expect(team.body.length).toBe(1);
  });
});

describe("HMRC seller tax details", () => {
  it("saves tax details and satisfies the verification step", async () => {
    const { app, db } = await freshApp();
    const cookie = await cookieFor(db, await ownerId(db, "hydro-hand-wash")); // unverified
    const r = await request(app).post("/api/provider/hmrc").set("Cookie", cookie)
      .send({ legalName: "Hydro Ltd", taxId: "GB123456789", address: "1 Wash St, London" });
    expect(r.body.saved).toBe(true);
    const me = await request(app).get("/api/provider/me").set("Cookie", cookie);
    expect(me.body.verification.hmrc_details).toBe(1);
  });
});
