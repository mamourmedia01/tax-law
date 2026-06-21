import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { cookieFor, freshApp, orgId, ownerId, registerCustomer } from "./helpers.js";
import {
  validateBankDetails,
  modulusCheck,
  normaliseAccountNumber,
  normaliseSortCode,
  maskAccountNumber,
} from "../src/banking.js";
import { newEncryptionKey } from "../src/crypto.js";

// ---------------------------------------------------------------------------
// ADVERSARIAL coverage for wrong-banking-details. Every invalid case must be
// (a) rejected with HTTP 400 (never a 500), and (b) carry a SPECIFIC, actionable
// message telling the user how to fix it. Valid details must encrypt at rest,
// mask on display, gate payout_setup, and stay isolated per provider.
//
// Fixtures verified against the embedded weight rows in banking.ts:
//   07-00-50 + 90000000  → passes MOD11   (VALID)
//   07-00-50 + 12345678  → fails MOD11
//   10-00-00 + 12345678  → fails MOD10
// ---------------------------------------------------------------------------

const VALID = { accountHolderName: "Ada Lovelace", sortCode: "07-00-50", accountNumber: "90000000" };

// --- pure validateBankDetails: exhaustive bad input → specific message -------
describe("validateBankDetails — adversarial inputs throw 400 with a correctable message", () => {
  function expectReject(input: Record<string, string>, fragment: string) {
    let threw = false;
    try {
      validateBankDetails(input as never);
    } catch (e) {
      threw = true;
      const err = e as { status?: number; message: string };
      expect(err.status).toBe(400);
      expect(err.message).toContain(fragment);
    }
    expect(threw).toBe(true);
  }

  // -- account holder name --
  it("rejects an empty name", () => {
    expectReject({ ...VALID, accountHolderName: "" }, "account holder");
  });
  it("rejects a whitespace-only name", () => {
    expectReject({ ...VALID, accountHolderName: "   " }, "account holder");
  });
  it("rejects a single-character name", () => {
    expectReject({ ...VALID, accountHolderName: "A" }, "account holder");
  });

  // -- sort code --
  it("rejects a too-short sort code", () => {
    expectReject({ ...VALID, sortCode: "1234" }, "6 digits");
  });
  it("rejects a too-long sort code", () => {
    expectReject({ ...VALID, sortCode: "1234567" }, "6 digits");
  });
  it("rejects a non-numeric sort code", () => {
    expectReject({ ...VALID, sortCode: "AB-CD-EF" }, "6 digits");
  });
  it("rejects an empty sort code", () => {
    expectReject({ ...VALID, sortCode: "" }, "6 digits");
  });
  it("rejects an all-zeros sort code (uncheckable, but never real)", () => {
    expectReject({ ...VALID, sortCode: "00-00-00" }, "sort code isn't valid");
  });
  it("accepts dashed and spaced sort-code formats (normalised)", () => {
    expect(validateBankDetails({ ...VALID, sortCode: "07-00-50" }).sortCode).toBe("070050");
    expect(validateBankDetails({ ...VALID, sortCode: "07 00 50" }).sortCode).toBe("070050");
    expect(validateBankDetails({ ...VALID, sortCode: "070050" }).sortCode).toBe("070050");
  });

  // -- account number --
  it("rejects a 7-digit numeric account number that fails the modulus after padding", () => {
    // 1234567 → 01234567; 070050+01234567 fails MOD11 → modulus message, not length
    expectReject({ ...VALID, accountNumber: "1234567" }, "UK bank check");
  });
  it("rejects a 9-digit account number (too long)", () => {
    expectReject({ ...VALID, accountNumber: "900000000" }, "8 digits");
  });
  it("rejects a 5-digit account number that cannot pad to 8", () => {
    // 5 digits is below the 6/7-digit padding window → stays 5 digits → length error
    expectReject({ ...VALID, accountNumber: "12345" }, "8 digits");
  });
  it("rejects a non-numeric account number", () => {
    expectReject({ ...VALID, accountNumber: "9000000X" }, "8 digits");
  });
  it("rejects an empty account number", () => {
    expectReject({ ...VALID, accountNumber: "" }, "8 digits");
  });
  it("rejects an all-zeros account number (uncheckable, but never real)", () => {
    // 999999 is uncheckable by the embedded table; all-zeros must still be caught.
    expectReject({ accountHolderName: "Ada", sortCode: "99-99-99", accountNumber: "00000000" }, "account number isn't valid");
  });
  it("accepts a 6-digit account number left-padded to 8 (070050 + 00030000 passes)", () => {
    const v = validateBankDetails({ ...VALID, accountNumber: "030000" });
    expect(v.accountNumber).toBe("00030000");
  });

  // -- modulus --
  it("rejects details that fail MOD11 with the bank-check guidance", () => {
    expectReject({ ...VALID, accountNumber: "12345678" }, "UK bank check");
  });
  it("rejects details that fail MOD10 with the bank-check guidance", () => {
    expectReject({ accountHolderName: "Ada", sortCode: "10-00-00", accountNumber: "12345678" }, "UK bank check");
  });
  it("accepts a known-good MOD11 pair", () => {
    expect(validateBankDetails(VALID).accountNumber).toBe("90000000");
  });
});

// --- modulus engine: known-good / known-bad / uncheckable --------------------
describe("modulus engine — known vectors", () => {
  it("MOD11: 070050+90000000 passes; 070050+12345678 fails (both checked)", () => {
    expect(modulusCheck("070050", "90000000")).toEqual({ valid: true, checked: true });
    expect(modulusCheck("070050", "12345678")).toEqual({ valid: false, checked: true });
  });
  it("MOD10: 100000+00000000 passes the algorithm; 100000+12345678 fails", () => {
    expect(modulusCheck("100000", "00000000").valid).toBe(true);
    expect(modulusCheck("100000", "12345678").valid).toBe(false);
  });
  it("uncheckable sort code reports checked:false, valid:true (not rejected by engine)", () => {
    expect(modulusCheck("999999", "12345678")).toEqual({ valid: false === false ? true : false, checked: false });
  });
  it("malformed combined length is rejected as checked:true/invalid", () => {
    expect(modulusCheck("07005", "90000000")).toEqual({ valid: false, checked: true });
  });
});

// --- normalisation edge cases not already covered ----------------------------
describe("normalisation edge cases", () => {
  it("strips spaces and dashes from account numbers before length checks", () => {
    expect(normaliseAccountNumber("9000 0000")).toBe("90000000");
    expect(normaliseAccountNumber("90-00-00-00")).toBe("90000000");
  });
  it("leaves an already-8-digit account number untouched", () => {
    expect(normaliseAccountNumber("00123456")).toBe("00123456"); // leading-zero account preserved
  });
  it("masks reveal only the final 4 digits", () => {
    expect(maskAccountNumber("00123456")).toBe("••••3456");
  });
  it("normaliseSortCode tolerates mixed separators", () => {
    expect(normaliseSortCode("07 00-50")).toBe("070050");
  });
});

// --- HTTP route: status codes, messages, persistence, security --------------
describe("POST/GET /api/provider/payout/bank — adversarial route behaviour", () => {
  const prev = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = newEncryptionKey();
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prev;
  });

  async function provider(slug = "hydro-hand-wash") {
    const { db, app } = await freshApp();
    const owner = await ownerId(db, slug);
    const cookie = await cookieFor(db, owner);
    return { db, app, cookie, oid: await orgId(db, slug) };
  }

  // -- every invalid case is 400 with a specific message and leaves payout_setup false --
  const badCases: Array<{ label: string; body: Record<string, string>; fragment: string }> = [
    { label: "all-zeros sort code", body: { ...VALID, sortCode: "000000" }, fragment: "sort code isn't valid" },
    { label: "short sort code", body: { ...VALID, sortCode: "12" }, fragment: "6 digits" },
    { label: "long sort code", body: { ...VALID, sortCode: "1234567" }, fragment: "6 digits" },
    { label: "non-numeric sort code", body: { ...VALID, sortCode: "ab cd ef" }, fragment: "6 digits" },
    { label: "all-zeros account", body: { ...VALID, accountNumber: "00000000" }, fragment: "account number isn't valid" },
    { label: "long account", body: { ...VALID, accountNumber: "123456789" }, fragment: "8 digits" },
    { label: "non-numeric account", body: { ...VALID, accountNumber: "abcd1234" }, fragment: "8 digits" },
    { label: "empty name", body: { ...VALID, accountHolderName: "" }, fragment: "account holder" },
    { label: "whitespace name", body: { ...VALID, accountHolderName: "   " }, fragment: "account holder" },
    { label: "modulus failure", body: { ...VALID, accountNumber: "12345678" }, fragment: "UK bank check" },
  ];

  for (const c of badCases) {
    it(`400 + specific message + payout_setup stays false: ${c.label}`, async () => {
      const { db, app, cookie, oid } = await provider();
      const res = await request(app).post("/api/provider/payout/bank").set("Cookie", cookie).send(c.body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
      expect(res.body.error.message).toContain(c.fragment);

      const v = await db.get<{ payout_setup: number }>(`SELECT payout_setup FROM verification WHERE org_id = ?`, [oid]);
      expect(v?.payout_setup ?? 0).toBe(0);
      // and nothing persisted in bank_accounts
      const row = await db.get<{ org_id: string }>(`SELECT org_id FROM bank_accounts WHERE org_id = ?`, [oid]);
      expect(row).toBeFalsy();
    });
  }

  it("a valid submission flips payout_setup true and encrypts at rest", async () => {
    const { db, app, cookie, oid } = await provider();
    const res = await request(app).post("/api/provider/payout/bank").set("Cookie", cookie).send(VALID);
    expect(res.status).toBe(200);

    const v = await db.get<{ payout_setup: number }>(`SELECT payout_setup FROM verification WHERE org_id = ?`, [oid]);
    expect(v?.payout_setup).toBe(1);

    // raw account number is NOT stored in the clear anywhere on the row
    const row = await db.get<{ account_number_enc: string; sort_code_enc: string; account_number_masked: string; account_holder_name: string }>(
      `SELECT account_number_enc, sort_code_enc, account_number_masked, account_holder_name FROM bank_accounts WHERE org_id = ?`,
      [oid],
    );
    expect(row?.account_number_enc).not.toBe("90000000");
    expect(row?.account_number_enc).not.toContain("90000000");
    expect(row?.sort_code_enc).not.toContain("070050");
    expect(row?.account_number_enc.startsWith("v1:")).toBe(true);
    expect(row?.sort_code_enc.startsWith("v1:")).toBe(true);
    expect(row?.account_number_masked).toBe("••••0000");
  });

  it("recovers after a bad submission: same provider can then submit valid details", async () => {
    const { db, app, cookie, oid } = await provider();
    const bad = await request(app).post("/api/provider/payout/bank").set("Cookie", cookie).send({ ...VALID, accountNumber: "12345678" });
    expect(bad.status).toBe(400);
    expect((await db.get<{ payout_setup: number }>(`SELECT payout_setup FROM verification WHERE org_id = ?`, [oid]))?.payout_setup ?? 0).toBe(0);

    const good = await request(app).post("/api/provider/payout/bank").set("Cookie", cookie).send(VALID);
    expect(good.status).toBe(200);
    expect((await db.get<{ payout_setup: number }>(`SELECT payout_setup FROM verification WHERE org_id = ?`, [oid]))?.payout_setup).toBe(1);
  });

  it("repeated valid submissions UPDATE in place, never duplicate the row", async () => {
    const { db, app, cookie, oid } = await provider();
    await request(app).post("/api/provider/payout/bank").set("Cookie", cookie).send(VALID);
    // second submission with a different valid pair (10-00-00 + 00000000 passes MOD10)
    const second = await request(app)
      .post("/api/provider/payout/bank")
      .set("Cookie", cookie)
      .send({ accountHolderName: "Grace Hopper", sortCode: "070050", accountNumber: "030000" });
    expect(second.status).toBe(200);

    const count = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bank_accounts WHERE org_id = ?`, [oid]);
    expect(Number(count?.n)).toBe(1);
    // latest values won
    const row = await db.get<{ account_holder_name: string; account_number_masked: string }>(
      `SELECT account_holder_name, account_number_masked FROM bank_accounts WHERE org_id = ?`,
      [oid],
    );
    expect(row?.account_holder_name).toBe("Grace Hopper");
  });

  it("GET returns only the masked form; the raw account number never appears", async () => {
    const { app, cookie } = await provider();
    await request(app).post("/api/provider/payout/bank").set("Cookie", cookie).send(VALID);
    const get = await request(app).get("/api/provider/payout/bank").set("Cookie", cookie);
    expect(get.status).toBe(200);
    expect(get.body.accountNumberMasked).toBe("••••0000");
    expect(get.body.sortCodeMasked).toBe("07-**-**");
    expect(JSON.stringify(get.body)).not.toContain("90000000");
    expect(JSON.stringify(get.body)).not.toContain("070050");
    // no raw fields leaked
    expect(get.body.accountNumber).toBeUndefined();
    expect(get.body.sortCode).toBeUndefined();
  });

  // -- security / ownership isolation --
  it("a customer (no provider org) cannot read or write bank details → 403", async () => {
    const { app } = await freshApp();
    const cust = await registerCustomer(app, "nobank@example.com");
    const get = await request(app).get("/api/provider/payout/bank").set("Cookie", cust.cookie);
    expect(get.status).toBe(403);
    const post = await request(app).post("/api/provider/payout/bank").set("Cookie", cust.cookie).send(VALID);
    expect(post.status).toBe(403);
  });

  it("unauthenticated requests are rejected (401)", async () => {
    const { app } = await freshApp();
    expect((await request(app).get("/api/provider/payout/bank")).status).toBe(401);
    expect((await request(app).post("/api/provider/payout/bank").send(VALID)).status).toBe(401);
  });

  it("Provider A cannot read or overwrite Provider B's bank details (per-org isolation)", async () => {
    const { db, app } = await freshApp();
    const aCookie = await cookieFor(db, await ownerId(db, "hydro-hand-wash"));
    const bCookie = await cookieFor(db, await ownerId(db, "gleamworks-detailing"));
    const aOid = await orgId(db, "hydro-hand-wash");
    const bOid = await orgId(db, "gleamworks-detailing");

    // B saves their details
    await request(app).post("/api/provider/payout/bank").set("Cookie", bCookie).send({ ...VALID, accountHolderName: "Bee Org" });

    // A has none, and A's GET never returns B's row
    const aGet = await request(app).get("/api/provider/payout/bank").set("Cookie", aCookie);
    expect(aGet.body).toBeNull();

    // A writing only ever touches A's own org row, never B's
    await request(app).post("/api/provider/payout/bank").set("Cookie", aCookie).send({ ...VALID, accountHolderName: "Aey Org" });
    const aRow = await db.get<{ account_holder_name: string }>(`SELECT account_holder_name FROM bank_accounts WHERE org_id = ?`, [aOid]);
    const bRow = await db.get<{ account_holder_name: string }>(`SELECT account_holder_name FROM bank_accounts WHERE org_id = ?`, [bOid]);
    expect(aRow?.account_holder_name).toBe("Aey Org");
    expect(bRow?.account_holder_name).toBe("Bee Org"); // B untouched
    // and B still reads their own original details, never A's
    const bGet = await request(app).get("/api/provider/payout/bank").set("Cookie", bCookie);
    expect(bGet.body.accountNumberMasked).toBe("••••0000");
  });
});
