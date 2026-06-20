import { describe, it, expect } from "vitest";
import { freshApp, orgId, ownerId } from "./helpers.js";
import { notify, runRebookNudges, type DeliveryChannel } from "../src/notifications.js";
import { createBooking } from "../src/bookings.js";
import { now } from "../src/lib.js";

// a channel that records what it "delivered"
function recordingChannels(): { channels: DeliveryChannel[]; sent: string[] } {
  const sent: string[] = [];
  const mk = (name: "push" | "email" | "sms"): DeliveryChannel => ({
    name,
    async send(to, title) {
      sent.push(`${name}:${title}`);
      return name === "push" ? true : !!(name === "sms" ? to.phone : to.email);
    },
  });
  return { channels: [mk("push"), mk("email"), mk("sms")], sent };
}

let slotSeq = 8;
async function makeLapsedCustomer(db: Awaited<ReturnType<typeof freshApp>>["db"], orgId_: string, consent: boolean) {
  const uid = `cust_${Math.random().toString(16).slice(2, 10)}`;
  await db.run(`INSERT INTO users (id, name, email, phone, claimed, marketing_consent, created_at) VALUES (?, 'X', ?, ?, 1, ?, ?)`, [
    uid,
    `${uid}@e.com`,
    `+44${uid}`,
    consent ? 1 : 0,
    now(),
  ]);
  const svc = (await db.get<{ id: string }>(`SELECT id FROM services WHERE org_id = ? LIMIT 1`, [orgId_]))!.id;
  const time = `${String(slotSeq++).padStart(2, "0")}:00`; // unique slot per customer
  await createBooking(db, uid, { orgId: orgId_, serviceIds: [svc], date: "2020-01-01", time, source: "marketplace_lead" });
  // backdate the booking so the customer is "lapsed"
  await db.run(`UPDATE bookings SET created_at = ? WHERE customer_user_id = ?`, [now() - 90 * 86400000, uid]);
  return uid;
}

describe("FW33 rebook nudges — double-gated (I33)", () => {
  it("suppressed when the provider has NOT opted in (gate A)", async () => {
    const { db } = await freshApp();
    const org = await orgId(db, "jamies-mobile-valet"); // rebook_nudges defaults to 0
    await makeLapsedCustomer(db, org, true);
    const { channels } = recordingChannels();
    const res = await runRebookNudges(db, channels, org);
    expect(res.providerOptIn).toBe(false);
    expect(res.sent).toBe(0);
  });

  it("with provider opted in: sends to consenting customers, suppresses non-consenting (gate B)", async () => {
    const { db } = await freshApp();
    const org = await orgId(db, "jamies-mobile-valet");
    await db.run(`UPDATE orgs SET rebook_nudges = 1 WHERE id = ?`, [org]);
    await makeLapsedCustomer(db, org, true); // consents
    await makeLapsedCustomer(db, org, false); // does not consent
    const { channels } = recordingChannels();
    const res = await runRebookNudges(db, channels, org);
    expect(res.providerOptIn).toBe(true);
    expect(res.sent).toBe(1); // only the consenting customer
    expect(res.suppressed).toBe(1);
  });
});

describe("FW33 delivery + consent (I32)", () => {
  it("a marketing message with no consent is never recorded or delivered", async () => {
    const { db } = await freshApp();
    const uid = `u_${Math.random().toString(16).slice(2, 8)}`;
    await db.run(`INSERT INTO users (id, marketing_consent, created_at) VALUES (?, 0, ?)`, [uid, now()]);
    const { channels, sent } = recordingChannels();
    const ok = await notify(db, uid, { bucket: "marketing", type: "promo", title: "Offer", body: "x", channels });
    expect(ok).toBe(false);
    expect(sent.length).toBe(0);
  });

  it("a transactional message always delivers via push", async () => {
    const { db } = await freshApp();
    const uid = `u_${Math.random().toString(16).slice(2, 8)}`;
    await db.run(`INSERT INTO users (id, email, marketing_consent, created_at) VALUES (?, 't@e.com', 0, ?)`, [uid, now()]);
    const { channels, sent } = recordingChannels();
    const ok = await notify(db, uid, { bucket: "transactional", type: "confirm", title: "Confirmed", body: "x", channels });
    expect(ok).toBe(true);
    expect(sent.some((s) => s.startsWith("push:"))).toBe(true);
  });
});

describe("FW31 concierge — grounded, suggest-never-act (I24, I25, I27)", () => {
  it("answers from the catalogue and the customer's own bookings, creating nothing", async () => {
    const { app, db } = await freshApp();
    const { registerCustomer } = await import("./helpers.js");
    const request = (await import("supertest")).default;
    const c = await registerCustomer(app, "concierge@example.com");

    const before = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings`);
    const res = await request(app).post("/api/concierge").set("Cookie", c.cookie).send({ message: "find me the cheapest valet" });
    expect(res.status).toBe(200);
    expect(res.body.grounded).toBe(true);
    expect(res.body.references.length).toBeGreaterThan(0);
    expect(res.body.references[0].href).toMatch(/^\/p\//); // deep-link only
    const after = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings`);
    expect(Number(after!.n)).toBe(Number(before!.n)); // booked nothing
    void ownerId;
  });
});
