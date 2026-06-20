import { describe, it, expect } from "vitest";
import request from "supertest";
import { freshApp, registerCustomer } from "./helpers.js";
import { lookupVehicle } from "../src/dvsa.js";

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
