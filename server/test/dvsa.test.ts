import { describe, it, expect } from "vitest";
import request from "supertest";
import { freshApp, registerCustomer } from "./helpers.js";
import { lookupVehicle, mapDvsaResponse } from "../src/dvsa.js";

describe("DVSA vehicle / MOT lookup", () => {
  it("returns a normalised vehicle (sandbox when no credentials), deterministically", async () => {
    const a = await lookupVehicle("AB12 CDE");
    const b = await lookupVehicle("ab12cde"); // same plate, normalised
    expect(a.registration).toBe("AB12CDE");
    expect(a.make).toBeTruthy();
    expect(["valid", "expired", "unknown"]).toContain(a.motStatus);
    expect(a.source).toBe("sandbox");
    expect(a.make).toBe(b.make); // deterministic
  });

  it("rejects an invalid registration", async () => {
    await expect(lookupVehicle("!!")).rejects.toMatchObject({ status: 400 });
  });

  it("requires auth on the route", async () => {
    const { app } = await freshApp();
    const anon = await request(app).get("/api/vehicles/AB12CDE");
    expect(anon.status).toBe(401);

    const c = await registerCustomer(app, "veh@example.com");
    const ok = await request(app).get("/api/vehicles/AB12CDE").set("Cookie", c.cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.registration).toBe("AB12CDE");
  });

  // #4: parse the real MOT History API schema robustly (no network needed).
  describe("real DVSA payload parsing (#4)", () => {
    it("parses a passed test with ISO dates and separates advisories from failures", () => {
      const raw = {
        registration: "ab12cde",
        make: "FORD",
        model: "FOCUS",
        primaryColour: "Blue",
        fuelType: "Petrol",
        firstUsedDate: "2016-03-01",
        motTests: [
          {
            completedDate: "2021-05-10 09:00:00",
            testResult: "PASSED",
            expiryDate: "2022-05-09",
            defects: [{ text: "Old advisory", type: "ADVISORY" }],
          },
          {
            completedDate: "2023-05-12 10:30:00",
            testResult: "PASSED",
            expiryDate: "2999-05-11", // far future → valid
            defects: [
              { text: "Nearside tyre worn", type: "ADVISORY" },
              { text: "Headlamp aim", type: "MAJOR", dangerous: false },
            ],
          },
        ],
      };
      const v = mapDvsaResponse("AB12CDE", raw);
      expect(v.registration).toBe("AB12CDE");
      expect(v.make).toBe("FORD");
      expect(v.colour).toBe("Blue");
      expect(v.motStatus).toBe("valid"); // picked the NEWER test by completedDate
      expect(v.motExpiry).toBe("2999-05-11");
      expect(v.advisories[0]).toBe("Nearside tyre worn"); // advisory listed before the MAJOR
      expect(v.source).toBe("dvsa");
    });

    it("handles dotted date format and a FAILED latest test", () => {
      const raw = {
        make: "BMW",
        primaryColour: "Black",
        motTests: [
          { completedDate: "2023.01.02 08:00:00", testResult: "FAILED", defects: [{ text: "Brake worn", type: "DANGEROUS", dangerous: true }] },
          { completedDate: "2022.01.02 08:00:00", testResult: "PASSED", expiryDate: "2023-01-01" },
        ],
      };
      const v = mapDvsaResponse("XY99ZZZ", raw);
      expect(v.motStatus).toBe("expired"); // latest is a FAIL with no expiry
      expect(v.motExpiry).toBeNull();
      expect(v.advisories).toContain("Brake worn");
    });

    it("returns unknown for a new vehicle with no MOT tests yet", () => {
      const v = mapDvsaResponse("NU71NEW", { make: "Tesla", primaryColour: "White", motTestDueDate: "2027-01-01", motTests: [] });
      expect(v.motStatus).toBe("unknown");
      expect(v.motExpiry).toBeNull();
      expect(v.make).toBe("Tesla");
      expect(v.advisories).toEqual([]);
    });
  });

  it("a booking persists the vehicle reg + description", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "vehbook@example.com");
    const p = await request(app).get("/api/providers/sparkle-on-wheels");
    const res = await request(app)
      .post("/api/bookings")
      .set("Cookie", c.cookie)
      .send({ providerSlug: "sparkle-on-wheels", serviceIds: [p.body.services[0].id], date: "2033-01-01", time: "10:00", vehicleReg: "AB12 CDE", vehicleDesc: "Blue Ford Focus · MOT valid" });
    expect(res.status).toBe(201);
    expect(res.body.vehicleReg).toBe("AB12 CDE");
    expect(res.body.vehicleDesc).toContain("Ford");
  });
});
