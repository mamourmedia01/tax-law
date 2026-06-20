import crypto from "node:crypto";
import type { Db } from "./database.js";
import { ApiError, Errors, id, now } from "./lib.js";
import { audit } from "./audit.js";

const REFERRAL_CREDIT = 5;

function refCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[b[i] % chars.length];
  return s;
}

export async function myReferral(db: Db, userId: string) {
  let u = await db.get<{ referral_code: string | null }>(`SELECT referral_code FROM users WHERE id = ?`, [userId]);
  if (!u?.referral_code) {
    // lazily assign a unique code
    for (let tries = 0; tries < 5; tries++) {
      const code = refCode();
      const ins = await db.run(`UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL`, [code, userId]);
      if (ins.changes > 0) break;
    }
    u = await db.get(`SELECT referral_code FROM users WHERE id = ?`, [userId]);
  }
  const count = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM referrals WHERE referrer_user_id = ?`, [userId]);
  return { code: u!.referral_code, referrals: Number(count?.n ?? 0), creditPerReferral: REFERRAL_CREDIT };
}

// A referee applies a code once → both parties get wallet credit. Guards self-referral,
// double-apply, and unknown codes. The referee uniqueness in `referrals` makes it idempotent.
export async function applyReferral(db: Db, refereeUserId: string, code: string) {
  const referrer = await db.get<{ id: string }>(`SELECT id FROM users WHERE referral_code = ?`, [code.trim().toUpperCase()]);
  if (!referrer) throw Errors.notFound("Unknown referral code");
  if (referrer.id === refereeUserId) throw Errors.badRequest("You can't refer yourself");

  const referee = await db.get<{ referred_by: string | null }>(`SELECT referred_by FROM users WHERE id = ?`, [refereeUserId]);
  if (referee?.referred_by) throw new ApiError(409, "already_referred", "You've already used a referral code");

  try {
    await db.tx(async (t) => {
      await t.run(`INSERT INTO referrals (id, referrer_user_id, referee_user_id, amount, created_at) VALUES (?, ?, ?, ?, ?)`, [
        id("ref"),
        referrer.id,
        refereeUserId,
        REFERRAL_CREDIT,
        now(),
      ]);
      await t.run(`UPDATE users SET referred_by = ? WHERE id = ?`, [code.trim().toUpperCase(), refereeUserId]);
      await t.run(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id IN (?, ?)`, [
        REFERRAL_CREDIT,
        referrer.id,
        refereeUserId,
      ]);
    });
  } catch (e) {
    if (String((e as { code?: string }).code).includes("CONSTRAINT") || (e as { code?: string }).code === "23505") {
      throw new ApiError(409, "already_referred", "You've already used a referral code");
    }
    throw e;
  }
  await audit(db, { actorUserId: refereeUserId, action: "referral.applied", meta: { amount: REFERRAL_CREDIT } });
  return { credited: REFERRAL_CREDIT };
}

// --- seasonal engine --------------------------------------------------------
// Deterministic by month — surfaces a themed campaign + the categories to push.
export function seasonalCampaign(month = new Date().getMonth()): {
  id: string;
  title: string;
  blurb: string;
  pushCategories: string[];
} {
  const campaigns = [
    { id: "winter-salt", months: [11, 0, 1], title: "Beat the winter salt", blurb: "Road salt eats paint — book a protective wash & wax.", pushCategories: ["Exterior wash", "Ceramic coating"] },
    { id: "spring-refresh", months: [2, 3, 4], title: "Spring refresh", blurb: "Pollen and grime gone — treat your car to a full valet.", pushCategories: ["Mobile valet", "Interior detail"] },
    { id: "summer-shine", months: [5, 6, 7], title: "Summer road-trip shine", blurb: "Holiday-ready in an hour — wash, wax and interior detail.", pushCategories: ["Mobile valet", "Wheels & tyres"] },
    { id: "autumn-protect", months: [8, 9, 10], title: "Autumn protection", blurb: "Leaves, rain and mud incoming — seal and protect now.", pushCategories: ["Ceramic coating", "Exterior wash"] },
  ];
  return campaigns.find((c) => c.months.includes(month)) ?? campaigns[0];
}

// --- B2B / fleet enquiries --------------------------------------------------
export async function createB2bEnquiry(
  db: Db,
  input: { name: string; email: string; company?: string; fleetSize?: number; message?: string },
) {
  const eid = id("b2b");
  await db.run(
    `INSERT INTO b2b_enquiries (id, name, email, company, fleet_size, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eid, input.name, input.email, input.company ?? "", input.fleetSize ?? 0, input.message ?? "", now()],
  );
  await audit(db, { action: "b2b.enquiry", targetType: "b2b", targetId: eid, meta: { fleetSize: input.fleetSize ?? 0 } });
  return { id: eid, received: true };
}
