import crypto from "node:crypto";
import type { Db } from "./database.js";
import { ApiError, Errors, id, now } from "./lib.js";
import { audit } from "./audit.js";

// FW30 commerce — packages (prepaid bundles), memberships (recurring), gift cards.
// All purchases are sandbox (no real charge); gift-card balance is promotional credit
// in the customer wallet and never represents provider funds (I12 unaffected).

// --- packages ---------------------------------------------------------------
export async function createPackage(
  db: Db,
  orgId: string,
  input: { name: string; description?: string; price: number; credits: number },
) {
  if (input.price <= 0 || input.credits <= 0) throw Errors.badRequest("Price and credits must be positive");
  const pid = id("pkg");
  await db.run(
    `INSERT INTO packages (id, org_id, name, description, price, credits, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [pid, orgId, input.name, input.description ?? "", input.price, input.credits, now()],
  );
  await audit(db, { action: "package.created", targetType: "org", targetId: orgId, meta: { credits: input.credits } });
  return db.get(`SELECT * FROM packages WHERE id = ?`, [pid]);
}

export async function listPackages(db: Db, orgId: string) {
  return db.all(`SELECT id, name, description, price, credits FROM packages WHERE org_id = ? AND active = 1`, [orgId]);
}

export async function purchasePackage(db: Db, customerUserId: string, packageId: string) {
  const pkg = await db.get<{ id: string; org_id: string; credits: number; active: number }>(
    `SELECT * FROM packages WHERE id = ?`,
    [packageId],
  );
  if (!pkg || !pkg.active) throw Errors.notFound("Package not found");
  const purchaseId = id("pcp");
  await db.run(
    `INSERT INTO package_purchases (id, package_id, org_id, customer_user_id, credits_remaining, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [purchaseId, packageId, pkg.org_id, customerUserId, pkg.credits, now()],
  );
  await audit(db, { actorUserId: customerUserId, action: "package.purchased", targetType: "package", targetId: packageId });
  return db.get(`SELECT * FROM package_purchases WHERE id = ?`, [purchaseId]);
}

// Redeem one credit (e.g. when booking). Atomic decrement, guarded against going negative.
export async function redeemPackageCredit(db: Db, customerUserId: string, orgId: string) {
  return db.tx(async (t) => {
    const purchase = await t.get<{ id: string; credits_remaining: number }>(
      `SELECT id, credits_remaining FROM package_purchases
       WHERE customer_user_id = ? AND org_id = ? AND credits_remaining > 0
       ORDER BY created_at ASC LIMIT 1`,
      [customerUserId, orgId],
    );
    if (!purchase) throw new ApiError(409, "no_credits", "No package credits remaining");
    await t.run(`UPDATE package_purchases SET credits_remaining = credits_remaining - 1 WHERE id = ?`, [purchase.id]);
    return { purchaseId: purchase.id, creditsRemaining: purchase.credits_remaining - 1 };
  });
}

export async function myPackages(db: Db, customerUserId: string) {
  return db.all(
    `SELECT pp.id, pp.credits_remaining, p.name, o.name AS provider, o.slug
     FROM package_purchases pp JOIN packages p ON p.id = pp.package_id JOIN orgs o ON o.id = pp.org_id
     WHERE pp.customer_user_id = ? AND pp.credits_remaining > 0`,
    [customerUserId],
  );
}

// --- memberships ------------------------------------------------------------
export async function createMembership(db: Db, orgId: string, input: { name: string; description?: string; monthlyPrice: number }) {
  if (input.monthlyPrice <= 0) throw Errors.badRequest("Monthly price must be positive");
  const mid = id("mbr");
  await db.run(
    `INSERT INTO memberships (id, org_id, name, description, monthly_price, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [mid, orgId, input.name, input.description ?? "", input.monthlyPrice, now()],
  );
  return db.get(`SELECT * FROM memberships WHERE id = ?`, [mid]);
}

export async function listMemberships(db: Db, orgId: string) {
  return db.all(`SELECT id, name, description, monthly_price FROM memberships WHERE org_id = ? AND active = 1`, [orgId]);
}

export async function joinMembership(db: Db, customerUserId: string, membershipId: string) {
  const m = await db.get<{ id: string; org_id: string; active: number }>(`SELECT * FROM memberships WHERE id = ?`, [membershipId]);
  if (!m || !m.active) throw Errors.notFound("Membership not found");
  const existing = await db.get(
    `SELECT id FROM member_subscriptions WHERE membership_id = ? AND customer_user_id = ? AND status = 'active'`,
    [membershipId, customerUserId],
  );
  if (existing) throw new ApiError(409, "already_member", "You're already a member");
  const sid = id("msub");
  await db.run(
    `INSERT INTO member_subscriptions (id, membership_id, org_id, customer_user_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    [sid, membershipId, m.org_id, customerUserId, now()],
  );
  await audit(db, { actorUserId: customerUserId, action: "membership.joined", targetType: "membership", targetId: membershipId });
  return db.get(`SELECT * FROM member_subscriptions WHERE id = ?`, [sid]);
}

// --- gift cards -------------------------------------------------------------
function giftCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const b = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) s += chars[b[i] % chars.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export async function issueGiftCard(db: Db, purchaserUserId: string, amount: number) {
  if (amount <= 0 || amount > 500) throw Errors.badRequest("Amount must be £1–£500");
  const code = giftCode();
  await db.run(
    `INSERT INTO gift_cards (code, amount, balance, purchaser_user_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    [code, amount, amount, purchaserUserId, now()],
  );
  await audit(db, { actorUserId: purchaserUserId, action: "giftcard.issued", meta: { amount } });
  return { code, amount, balance: amount };
}

// Redeem a gift card into the customer's wallet (promotional credit).
export async function redeemGiftCard(db: Db, customerUserId: string, code: string) {
  return db.tx(async (t) => {
    const card = await t.get<{ code: string; balance: number; redeemed_by_user_id: string | null }>(
      `SELECT * FROM gift_cards WHERE code = ?`,
      [code.trim().toUpperCase()],
    );
    if (!card) throw Errors.notFound("Gift card not found");
    if (card.redeemed_by_user_id) throw new ApiError(409, "already_redeemed", "This gift card was already redeemed");
    await t.run(`UPDATE gift_cards SET balance = 0, redeemed_by_user_id = ?, redeemed_at = ? WHERE code = ?`, [
      customerUserId,
      now(),
      card.code,
    ]);
    await t.run(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`, [card.balance, customerUserId]);
    return { credited: card.balance };
  });
}

export async function walletBalance(db: Db, userId: string): Promise<number> {
  const u = await db.get<{ wallet_balance: number }>(`SELECT wallet_balance FROM users WHERE id = ?`, [userId]);
  return Number(u?.wallet_balance ?? 0);
}
