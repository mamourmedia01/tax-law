import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newEncryptionKey } from "../src/crypto.js";

describe("field encryption at rest (AES-256-GCM)", () => {
  const prev = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = newEncryptionKey();
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prev;
  });

  it("round-trips a value and tolerates plaintext", async () => {
    const { encryptField, decryptField } = await import("../src/crypto.js");
    const secret = "3132333435363738393031323334353637383930";
    const enc = encryptField(secret);
    expect(enc).not.toBe(secret);
    expect(enc?.startsWith("v1:")).toBe(true);
    expect(decryptField(enc)).toBe(secret);
    // plaintext (pre-encryption / dev data) passes through unchanged
    expect(decryptField(secret)).toBe(secret);
  });
});
