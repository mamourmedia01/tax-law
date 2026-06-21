import { describe, it, expect } from "vitest";
import { validateUkPostcode, haversineKm, sandboxGeocode, geocodePostcode } from "../src/geo.js";
import { ApiError } from "../src/lib.js";

describe("geo: UK postcode validation & correction", () => {
  it("normalises to canonical 'AA1 1AA' form (upper-case, single inward space)", () => {
    expect(validateUkPostcode("sw1a1aa")).toBe("SW1A 1AA");
    expect(validateUkPostcode("  ec1a   1bb ")).toBe("EC1A 1BB");
    expect(validateUkPostcode("m11ae")).toBe("M1 1AE");
    expect(validateUkPostcode("gir0aa")).toBe("GIR 0AA");
  });

  it("rejects malformed postcodes with a specific, correctable message", () => {
    let err: unknown;
    try {
      validateUkPostcode("NOTAPOSTCODE");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toMatch(/SW1A 1AA/);
  });

  it("rejects an empty postcode with a prompt to enter one", () => {
    expect(() => validateUkPostcode("   ")).toThrow(/enter your postcode/i);
  });
});

describe("geo: haversine distance", () => {
  it("computes a known great-circle distance (London ↔ Paris ≈ 343 km)", () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const paris = { lat: 48.8566, lng: 2.3522 };
    const d = haversineKm(london, paris);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });

  it("is zero for identical points", () => {
    expect(haversineKm({ lat: 51.5, lng: -0.1 }, { lat: 51.5, lng: -0.1 })).toBeCloseTo(0, 6);
  });
});

describe("geo: deterministic sandbox geocode", () => {
  it("returns stable coordinates near London for the same postcode", () => {
    const a = sandboxGeocode("SW1A 1AA");
    const b = sandboxGeocode("SW1A 1AA");
    expect(a).toEqual(b);
    expect(a.source).toBe("sandbox");
    expect(haversineKm({ lat: 51.5074, lng: -0.1278 }, a)).toBeLessThan(50);
  });

  it("geocodePostcode validates then returns a result (sandbox fallback offline)", async () => {
    const r = await geocodePostcode("sw1a1aa");
    expect(r.postcode).toBe("SW1A 1AA");
    expect(["postcodes_io", "sandbox"]).toContain(r.source);
    expect(typeof r.lat).toBe("number");
    expect(typeof r.lng).toBe("number");
  });

  it("geocodePostcode rejects malformed input before any network call", async () => {
    await expect(geocodePostcode("nope")).rejects.toThrow(/UK postcode/);
  });
});
