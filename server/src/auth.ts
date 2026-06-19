import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { DB } from "./db.js";
import { ApiError, Errors, config, id, now, otpCode, sha256, timingSafeEqual } from "./lib.js";
import { audit } from "./audit.js";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  claimed: number;
  marketing_consent: number;
  is_admin: number;
  created_at: number;
}

const OTP_TTL = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE = "fp_session";

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isPhone(s: string): boolean {
  return s.replace(/\D/g, "").length >= 10;
}

// Request an OTP. In sandbox (OTP_CHANNEL=console) we return the code so the flow is
// testable without an SMS provider; a real channel would deliver out-of-band only.
export function requestOtp(db: DB, identifier: string): { sent: boolean; devCode?: string } {
  identifier = identifier.trim().toLowerCase();
  const channel = isEmail(identifier) ? "email" : isPhone(identifier) ? "phone" : null;
  if (!channel) throw Errors.badRequest("Enter a valid mobile number or email");

  // basic rate-limit: max 3 live (unconsumed, unexpired) codes per identifier
  const live = db
    .prepare(`SELECT COUNT(*) AS n FROM otps WHERE identifier = ? AND consumed_at IS NULL AND expires_at > ?`)
    .get(identifier, now()) as { n: number };
  if (live.n >= 3) throw Errors.tooMany("Too many codes requested — wait a moment");

  const code = otpCode();
  db.prepare(
    `INSERT INTO otps (id, identifier, channel, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id("otp"), identifier, channel, sha256(code), now() + OTP_TTL, now());

  if (config.otpChannel === "console") {
    // sandbox delivery
    console.log(`[OTP] ${identifier} -> ${code}`);
    return { sent: true, devCode: code };
  }
  return { sent: true };
}

// Verify an OTP, find-or-create the user (guest), and open a session.
export function verifyOtp(
  db: DB,
  identifier: string,
  code: string,
): { token: string; user: User } {
  identifier = identifier.trim().toLowerCase();
  const channel = isEmail(identifier) ? "email" : "phone";
  const otp = db
    .prepare(
      `SELECT * FROM otps WHERE identifier = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get(identifier) as
    | { id: string; code_hash: string; attempts: number; expires_at: number }
    | undefined;

  if (!otp) throw Errors.badRequest("Request a code first");
  if (otp.expires_at < now()) throw Errors.badRequest("Code expired — request a new one");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw Errors.tooMany("Too many attempts — request a new code");

  if (!timingSafeEqual(otp.code_hash, sha256(code))) {
    db.prepare(`UPDATE otps SET attempts = attempts + 1 WHERE id = ?`).run(otp.id);
    throw Errors.badRequest("Incorrect code");
  }
  db.prepare(`UPDATE otps SET consumed_at = ? WHERE id = ?`).run(now(), otp.id);

  // find-or-create user keyed on the verified identifier
  const col = channel === "email" ? "email" : "phone";
  let user = db.prepare(`SELECT * FROM users WHERE ${col} = ?`).get(identifier) as User | undefined;
  if (!user) {
    const uid = id("usr");
    db.prepare(
      `INSERT INTO users (id, name, ${col}, claimed, created_at) VALUES (?, '', ?, 0, ?)`,
    ).run(uid, identifier, now());
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(uid) as User;
    audit(db, { actorUserId: uid, action: "user.created", targetType: "user", targetId: uid });
  }

  const token = createSession(db, user.id);
  audit(db, { actorUserId: user.id, action: "auth.login", targetType: "user", targetId: user.id });
  return { token, user };
}

export function createSession(db: DB, userId: string): string {
  const raw = `${id("sess")}.${crypto.randomBytes(24).toString("hex")}`;
  db.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id("ses"), sha256(raw), userId, now(), now() + SESSION_TTL);
  return raw;
}

export function userFromToken(db: DB, token: string | undefined): User | null {
  if (!token) return null;
  const session = db
    .prepare(`SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?`)
    .get(sha256(token), now()) as { user_id: string } | undefined;
  if (!session) return null;
  return (db.prepare(`SELECT * FROM users WHERE id = ?`).get(session.user_id) as User) ?? null;
}

export function destroySession(db: DB, token: string | undefined): void {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(sha256(token));
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL,
    path: "/",
  });
}
export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE, { path: "/" });
}
export function readToken(req: Request): string | undefined {
  return req.cookies?.[COOKIE];
}

// --- middleware ---------------------------------------------------------------
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      db: DB;
      user: User | null;
    }
  }
}

export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  req.user = userFromToken(req.db, readToken(req));
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw Errors.unauthorized();
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.is_admin) throw Errors.forbidden("Admin only");
  next();
}

// Claim a guest account (sets name/contact, claimed=1) — resolves prior guest data (I22).
export function claimAccount(
  db: DB,
  user: User,
  patch: { name?: string; email?: string; phone?: string; marketing_consent?: boolean },
): User {
  const name = patch.name?.trim() ?? user.name;
  const email = patch.email?.trim().toLowerCase() || user.email;
  const phone = patch.phone?.trim() || user.phone;
  // guard uniqueness
  if (email && email !== user.email) {
    const taken = db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).get(email, user.id);
    if (taken) throw new ApiError(409, "conflict", "That email is already in use");
  }
  if (phone && phone !== user.phone) {
    const taken = db.prepare(`SELECT id FROM users WHERE phone = ? AND id != ?`).get(phone, user.id);
    if (taken) throw new ApiError(409, "conflict", "That number is already in use");
  }
  db.prepare(
    `UPDATE users SET name = ?, email = ?, phone = ?, marketing_consent = ?, claimed = 1 WHERE id = ?`,
  ).run(
    name,
    email,
    phone,
    patch.marketing_consent === undefined ? user.marketing_consent : patch.marketing_consent ? 1 : 0,
    user.id,
  );
  audit(db, { actorUserId: user.id, action: "user.claimed", targetType: "user", targetId: user.id });
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as User;
}

export const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  claimed: !!u.claimed,
  marketingConsent: !!u.marketing_consent,
  isAdmin: !!u.is_admin,
});
