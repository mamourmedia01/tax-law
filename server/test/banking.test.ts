import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, orgId, ownerId } from "./helpers.js";
import {
  modulusCheck,
  normaliseAccountNumber,
  normaliseSortCode,
  maskAccountNumber,
} from "../src/banking.js";
import { newEncryptionKey } from "../src/crypto.js";

// Fixtures verified against the embedded weight rows in banking.ts:
//   07-00-50 + 90000000 passes the MOD11 row; 12345678 fails it.
const VALID = { accountHolderName: "Ada Lovelace", sortCode: "07-00-50", accountNumber: "90000000" };

describe("UK bank details — normalisation & modulus engine", () => {
  it("normalises sort code formats to 6 digits", () => {
    expect(normaliseSortCode("12-34-56")).toBe("123456");
    expect(normaliseSortCode("12 34 56")).toBe("123456");
    expect(normaliseSortCode("123456")).toBe("123456");
  });

  it("left-pads 6/7-digit account numbers to 8 per UK convention", () => {
    expect(normaliseAccountNumber("123456")).toBe("00123456");
    expect(normaliseAccountNumber("1234567")).toBe("01234567");
    expect(normaliseAccountNumber("12345678")).toBe("12345678");
  });

  it("masks to last 4 digits only", () => {
    expect(maskAccountNumber("90000000")).toBe("••••0000");
    expect(maskAccountNumber("12345678")).toBe("••••5678");
  });

  it("modulus check passes a genuinely-valid account and fails an invalid one", () => {
    expect(modulusCheck("070050", "90000000").valid).toBe(true);
    expect(modulusCheck("070050", "90000000").checked).toBe(true);
    expect(modulusCheck("070050", "12345678").valid).toBe(false);
  });

  it("reports uncheckable when no weight row covers the sort code", () => {
    const r = modulusCheck("999999", "12345678");
    expect(r.checked).toBe(false);
    expect(r.valid).toBe(true); // uncheckable → not rejected by the engine
  });
});

describe("POST /api/provider/payout/bank", () => {
  const prev = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = newEncryptionKey();
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prev;
  });

  async function provider() {
    const { db, app } = await freshApp();
    const slug = "hydro-hand-wash"; // unverified seed org → payout_setup starts 0
    const owner = await ownerId(db, slug);
    const cookie = await cookieFor(db, owner);
    return { db, app, cookie, oid: await orgId(db, slug) };
  }

  it("accepts valid details: payout_setup flips true, details encrypted at rest, masked display", async () => {
    const { db, app, cookie, oid } = await provider();
    const res = await request(app).post("/api/provider/payout/bank").set("Cookie", cookie).send(VALID);
    expect(res.status).toBe(200);
    expect(res.body.accountNumberMasked).toBe("••••0000");
    expect(res.body.sortCodeMasked).toBe("07-**-**");

    // payout_setup gated true
    const v = await db.get<{ payout_setup: number }>(`SELECT payout_setup FROM verification WHERE org_id = ?`, [oid]);
    expect(v?.payout_setup).toBe(1);

    // encrypted at rest: stored ciphertext is not the plaintext and uses the v1: envelope
    const row = await db.get<{ account_number_enc: string; sort_code_enc: string; account_number_masked: string }>(
      `SELECT account_number_enc, sort_code_enc, account_number_masked FROM bank_accounts WHERE org_id = ?`,
      [oid],
    );
    expect(row?.account_number_enc).not.toContain("90000000");
    expect(row?.account_number_enc.startsWith("v1:")).toBe(true);
    expect(row?.sort_code_enc.startsWith("v1:")).toBe(true);
    // masked form only in the clear
    expect(row?.account_number_masked).toBe("••••0000");

    // GET surfaces only the masked form
    const me = await request(app).get("/api/provider/me").set("Cookie", cookie);
    expect(me.body.bankAccount.accountNumberMasked).toBe("••••0000");
    expect(JSON.stringify(me.body.bankAccount)).not.toContain("90000000");
  });

  it("rejects a bad sort code length with a specific, correctable message", async () => {
    const { app, cookie } = await provider();
    const res = await request(app)
      .post("/api/provider/payout/bank")
      .set("Cookie", cookie)
      .send({ ...VALID, sortCode: "1234" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Sort code must be 6 digits (e.g. 12-34-56).");
  });

  it("rejects a bad account number length with a specific message", async () => {
    const { app, cookie } = await provider();
    const res = await request(app)
      .post("/api/provider/payout/bank")
      .set("Cookie", cookie)
      .send({ ...VALID, accountNumber: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Account number must be 8 digits.");
  });

  it("rejects a missing account holder name with a correctable message", async () => {
    const { app, cookie } = await provider();
    const res = await request(app)
      .post("/api/provider/payout/bank")
      .set("Cookie", cookie)
      .send({ ...VALID, accountHolderName: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Enter the account holder's name exactly as it appears on the account.");
  });

  it("rejects details that fail the UK modulus check and does NOT set payout_setup", async () => {
    const { db, app, cookie, oid } = await provider();
    const res = await request(app)
      .post("/api/provider/payout/bank")
      .set("Cookie", cookie)
      .send({ ...VALID, accountNumber: "12345678" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      "These bank details didn't pass the UK bank check — please double-check the sort code and account number.",
    );
    const v = await db.get<{ payout_setup: number } | undefined>(
      `SELECT payout_setup FROM verification WHERE org_id = ?`,
      [oid],
    );
    expect(v?.payout_setup ?? 0).toBe(0);
  });

  it("accepts a 6-digit account number by left-padding to 8", async () => {
    const { app, cookie } = await provider();
    // 070050 + 00030000 passes MOD11; "30000" left-pads to "00030000"
    const res = await request(app)
      .post("/api/provider/payout/bank")
      .set("Cookie", cookie)
      .send({ accountHolderName: "Grace Hopper", sortCode: "070050", accountNumber: "030000" });
    expect(res.status).toBe(200);
    expect(res.body.accountNumberMasked).toBe("••••0000");
  });
});
