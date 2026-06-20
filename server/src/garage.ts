import type { Db } from "./database.js";
import { ApiError, Errors, id, now } from "./lib.js";
import { lookupVehicle } from "./dvsa.js";
import { audit } from "./audit.js";

// My Garage — a customer's saved vehicles (DVSA-enriched). Used to prefill bookings.
export async function listGarage(db: Db, userId: string) {
  return db.all(
    `SELECT id, reg, make, model, colour, fuel, mot_status AS "motStatus", mot_expiry AS "motExpiry"
     FROM vehicles WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  );
}

export async function addVehicle(db: Db, userId: string, reg: string) {
  const v = await lookupVehicle(reg); // validates + DVSA/sandbox enrich
  const existing = await db.get(`SELECT id FROM vehicles WHERE user_id = ? AND reg = ?`, [userId, v.registration]);
  if (existing) throw new ApiError(409, "exists", "That vehicle is already in your garage");
  const vid = id("veh");
  await db.run(
    `INSERT INTO vehicles (id, user_id, reg, make, model, colour, fuel, mot_status, mot_expiry, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [vid, userId, v.registration, v.make, v.model, v.colour, v.fuelType, v.motStatus, v.motExpiry, now()],
  );
  await audit(db, { actorUserId: userId, action: "garage.add", targetType: "vehicle", targetId: vid });
  return (await db.get(`SELECT id, reg, make, model, colour, fuel, mot_status AS "motStatus", mot_expiry AS "motExpiry" FROM vehicles WHERE id = ?`, [vid]))!;
}

export async function removeVehicle(db: Db, userId: string, vehicleId: string) {
  const r = await db.run(`DELETE FROM vehicles WHERE id = ? AND user_id = ?`, [vehicleId, userId]);
  if (r.changes === 0) throw Errors.notFound("Vehicle not found");
  return { deleted: true };
}
