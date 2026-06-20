import type { Db } from "./database.js";
import { Errors, id, now } from "./lib.js";
import { audit } from "./audit.js";

// FW30 KYC document submission (sandbox). Stores only a reference + status — never the
// file bytes, never anything in logs/AI. Submitting a doc moves KYC to 'pending'; the
// sandbox identity check then resolves it. Real builds call Stripe Identity / Onfido.
export async function submitKycDocument(
  db: Db,
  orgId: string,
  docType: "id_front" | "id_back" | "proof_address" | "insurance",
): Promise<{ documentId: string; kycStatus: string }> {
  const storageRef = `enc://kyc/${orgId}/${id("doc")}`; // opaque ref into encrypted storage
  await db.run(
    `INSERT INTO kyc_documents (id, org_id, doc_type, storage_ref, status, created_at) VALUES (?, ?, ?, ?, 'submitted', ?)`,
    [id("kdoc"), orgId, docType, storageRef, now()],
  );
  await getVerification(db, orgId);
  await db.run(`UPDATE verification SET kyc_status = 'pending' WHERE org_id = ?`, [orgId]);
  // audit carries the doc TYPE only — never the contents (I6/I36)
  await audit(db, { action: "kyc.document_submitted", targetType: "org", targetId: orgId, meta: { docType } });
  return { documentId: storageRef, kycStatus: "pending" };
}

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

export async function getVerification(db: Db, orgId: string): Promise<Verification> {
  let v = await db.get<Verification>(`SELECT * FROM verification WHERE org_id = ?`, [orgId]);
  if (!v) {
    await db.run(`INSERT INTO verification (org_id) VALUES (?)`, [orgId]);
    v = (await db.get<Verification>(`SELECT * FROM verification WHERE org_id = ?`, [orgId]))!;
  }
  return v;
}

// The badge is DERIVED, never set directly (I21). Verified == every step complete.
async function recompute(db: Db, orgId: string): Promise<boolean> {
  const v = await getVerification(db, orgId);
  const verified =
    v.kyc_status === "passed" && !!v.asset_check && !!v.hmrc_details && !!v.payout_setup && !!v.twofa;
  await db.run(`UPDATE verification SET verified_at = ? WHERE org_id = ?`, [
    verified ? (v.verified_at ?? now()) : null,
    orgId,
  ]);
  await db.run(`UPDATE orgs SET verified = ? WHERE id = ?`, [verified ? 1 : 0, orgId]);
  return verified;
}

// Sandbox KYC: a real build calls Stripe Identity / Onfido in test mode here.
export async function runSandboxKyc(db: Db, orgId: string, outcome: "passed" | "failed" = "passed"): Promise<boolean> {
  await getVerification(db, orgId);
  await db.run(`UPDATE verification SET kyc_status = ? WHERE org_id = ?`, [outcome, orgId]);
  await audit(db, { action: "kyc.completed", targetType: "org", targetId: orgId, meta: { outcome } });
  return recompute(db, orgId);
}

export async function setStep(db: Db, orgId: string, step: VerStep, value: boolean): Promise<boolean> {
  await getVerification(db, orgId);
  if (!["asset_check", "hmrc_details", "payout_setup", "twofa"].includes(step)) {
    throw Errors.badRequest("Unknown verification step");
  }
  await db.run(`UPDATE verification SET ${step} = ? WHERE org_id = ?`, [value ? 1 : 0, orgId]);
  await audit(db, { action: "verification.step", targetType: "org", targetId: orgId, meta: { step, value } });
  return recompute(db, orgId);
}

export async function isVerified(db: Db, orgId: string): Promise<boolean> {
  const o = await db.get<{ verified: number }>(`SELECT verified FROM orgs WHERE id = ?`, [orgId]);
  return !!o?.verified;
}
