import type { DB } from "./db.js";
import { Errors, now } from "./lib.js";
import { audit } from "./audit.js";

export interface Verification {
  org_id: string;
  kyc_status: string;
  asset_check: number;
  hmrc_details: number;
  payout_setup: number;
  twofa: number;
  verified_at: number | null;
}

export type VerStep = "asset_check" | "hmrc_details" | "payout_setup" | "twofa";

export function getVerification(db: DB, orgId: string): Verification {
  let v = db.prepare(`SELECT * FROM verification WHERE org_id = ?`).get(orgId) as Verification | undefined;
  if (!v) {
    db.prepare(`INSERT INTO verification (org_id) VALUES (?)`).run(orgId);
    v = db.prepare(`SELECT * FROM verification WHERE org_id = ?`).get(orgId) as Verification;
  }
  return v;
}

// The badge is DERIVED, never set directly (I21). Verified == every step complete.
function recompute(db: DB, orgId: string): boolean {
  const v = getVerification(db, orgId);
  const verified =
    v.kyc_status === "passed" && !!v.asset_check && !!v.hmrc_details && !!v.payout_setup && !!v.twofa;
  db.prepare(`UPDATE verification SET verified_at = ? WHERE org_id = ?`).run(
    verified ? v.verified_at ?? now() : null,
    orgId,
  );
  db.prepare(`UPDATE orgs SET verified = ? WHERE id = ?`).run(verified ? 1 : 0, orgId);
  return verified;
}

// Sandbox KYC: a real build calls Stripe Identity / Onfido in test mode here.
export function runSandboxKyc(db: DB, orgId: string, outcome: "passed" | "failed" = "passed"): boolean {
  getVerification(db, orgId);
  db.prepare(`UPDATE verification SET kyc_status = ? WHERE org_id = ?`).run(outcome, orgId);
  audit(db, { action: "kyc.completed", targetType: "org", targetId: orgId, meta: { outcome } });
  return recompute(db, orgId);
}

export function setStep(db: DB, orgId: string, step: VerStep, value: boolean): boolean {
  getVerification(db, orgId);
  if (!["asset_check", "hmrc_details", "payout_setup", "twofa"].includes(step)) {
    throw Errors.badRequest("Unknown verification step");
  }
  db.prepare(`UPDATE verification SET ${step} = ? WHERE org_id = ?`).run(value ? 1 : 0, orgId);
  audit(db, { action: "verification.step", targetType: "org", targetId: orgId, meta: { step, value } });
  return recompute(db, orgId);
}

export function isVerified(db: DB, orgId: string): boolean {
  const o = db.prepare(`SELECT verified FROM orgs WHERE id = ?`).get(orgId) as { verified: number } | undefined;
  return !!o?.verified;
}
