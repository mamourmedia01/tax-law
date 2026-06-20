import { describe, it, expect } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, ownerId, registerCustomer } from "./helpers.js";

describe("FW30 packages", () => {
  it("provider creates a package; customer buys and redeems credits", async () => {
    const { app, db } = await freshApp();
    const owner = await ownerId(db, "sparkle-on-wheels"); // no seeded package
    const pkg = await request(app)
      .post("/api/provider/packages")
      .set("Cookie", await cookieFor(db, owner))
      .send({ name: "5 washes", price: 90, credits: 5 });
    expect(pkg.status).toBe(201);

    const detail = await request(app).get("/api/providers/sparkle-on-wheels");
    expect(detail.body.packages.length).toBe(1);

    const c = await registerCustomer(app, "pkg@example.com");
    const buy = await request(app).post(`/api/packages/${pkg.body.id}/purchase`).set("Cookie", c.cookie).send({});
    expect(buy.status).toBe(201);
    expect(buy.body.credits_remaining).toBe(5);

    const mine = await request(app).get("/api/me/packages").set("Cookie", c.cookie);
    expect(mine.body[0].credits_remaining).toBe(5);
  });
});

describe("FW30 gift cards", () => {
  it("issues a card and redeems it into the wallet (once only)", async () => {
    const { app } = await freshApp();
    const buyer = await registerCustomer(app, "gifter@example.com");
    const card = await request(app).post("/api/giftcards").set("Cookie", buyer.cookie).send({ amount: 25 });
    expect(card.status).toBe(201);
    expect(card.body.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const recipient = await registerCustomer(app, "lucky@example.com");
    const r1 = await request(app).post("/api/giftcards/redeem").set("Cookie", recipient.cookie).send({ code: card.body.code });
    expect(r1.body.credited).toBe(25);
    const wallet = await request(app).get("/api/account/wallet").set("Cookie", recipient.cookie);
    expect(wallet.body.balance).toBe(25);

    const r2 = await request(app).post("/api/giftcards/redeem").set("Cookie", recipient.cookie).send({ code: card.body.code });
    expect(r2.status).toBe(409); // already redeemed
  });
});

describe("FW30 memberships", () => {
  it("provider creates a membership; customer joins (once)", async () => {
    const { app, db } = await freshApp();
    const owner = await ownerId(db, "gleamworks-detailing");
    const m = await request(app)
      .post("/api/provider/memberships")
      .set("Cookie", await cookieFor(db, owner))
      .send({ name: "Unlimited maintenance", monthlyPrice: 29 });
    expect(m.status).toBe(201);

    const c = await registerCustomer(app, "member@example.com");
    const join1 = await request(app).post(`/api/memberships/${m.body.id}/join`).set("Cookie", c.cookie).send({});
    expect(join1.status).toBe(201);
    const join2 = await request(app).post(`/api/memberships/${m.body.id}/join`).set("Cookie", c.cookie).send({});
    expect(join2.status).toBe(409);
  });
});

describe("FW30 KYC document submission (sandbox)", () => {
  it("submitting a doc moves KYC to pending and never stores file contents", async () => {
    const { app, db } = await freshApp();
    const owner = await ownerId(db, "hydro-hand-wash"); // unverified
    const res = await request(app)
      .post("/api/provider/verify/kyc/document")
      .set("Cookie", await cookieFor(db, owner))
      .send({ docType: "id_front" });
    expect(res.status).toBe(200);
    expect(res.body.kycStatus).toBe("pending");
    expect(res.body.documentId).toMatch(/^enc:\/\//); // opaque ref, not contents
    const row = await db.get<{ doc_type: string; storage_ref: string }>(`SELECT doc_type, storage_ref FROM kyc_documents LIMIT 1`);
    expect(row!.doc_type).toBe("id_front");
  });
});
