import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { Db } from "./database.js";
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
  admin_totp_secret: string | null;
  wallet_balance: number;
  created_at: number;
}

const OTP_TTL = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const COOKIE = "fp_session";

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isPhone(s: string): boolean {
  return s.replace(/\D/g, "").length >= 10;
}

// Request an OTP. In sandbox (OTP_CHANNEL=console) we return the code so the flow is
// testable without an SMS provider; a real channel would deliver out-of-band only.
export async function requestOtp(db: Db, identifier: string): Promise<{ sent: boolean; devCode?: string }> {
  identifier = identifier.trim().toLowerCase();
  const channel = isEmail(identifier) ? "email" : isPhone(identifier) ? "phone" : null;
  if (!channel) throw Errors.badRequest("Enter a valid mobile number or email");

  const live = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM otps WHERE identifier = ? AND consumed_at IS NULL AND expires_at > ?`,
    [identifier, now()],
  );
  if (Number(live?.n ?? 0) >= 3) throw Errors.tooMany("Too many codes requested — wait a moment");

  const code = otpCode();
  await db.run(
    `INSERT INTO otps (id, identifier, channel, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id("otp"), identifier, channel, sha256(code), now() + OTP_TTL, now()],
  );

  if (config.otpChannel === "console") {
    console.log(`[OTP] ${identifier} -> ${code}`);
    return { sent: true, devCode: code };
  }
  return { sent: true };
}

// Verify an OTP, find-or-create the user (guest), and open a session.
export async function verifyOtp(db: Db, identifier: string, code: string): Promise<{ token: string; user: User }> {
  identifier = identifier.trim().toLowerCase();
  const channel = isEmail(identifier) ? "email" : "phone";
  const otp = await db.get<{ id: string; code_hash: string; attempts: number; expires_at: number }>(
    `SELECT * FROM otps WHERE identifier = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [identifier],
  );

  if (!otp) throw Errors.badRequest("Request a code first");
  if (otp.expires_at < now()) throw Errors.badRequest("Code expired — request a new one");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw Errors.tooMany("Too many attempts — request a new code");

  if (!timingSafeEqual(otp.code_hash, sha256(code))) {
    await db.run(`UPDATE otps SET attempts = attempts + 1 WHERE id = ?`, [otp.id]);
    throw Errors.badRequest("Incorrect code");
  }
  await db.run(`UPDATE otps SET consumed_at = ? WHERE id = ?`, [now(), otp.id]);

  const col = channel === "email" ? "email" : "phone";
  let user = await db.get<User>(`SELECT * FROM users WHERE ${col} = ?`, [identifier]);
  if (!user) {
    const uid = id("usr");
    await db.run(`INSERT INTO users (id, name, ${col}, claimed, created_at) VALUES (?, '', ?, 0, ?)`, [
      uid,
      identifier,
      now(),
    ]);
    user = (await db.get<User>(`SELECT * FROM users WHERE id = ?`, [uid]))!;
    await audit(db, { actorUserId: uid, action: "user.created", targetType: "user", targetId: uid });
  }

  const token = await createSession(db, user.id);
  await audit(db, { actorUserId: user.id, action: "auth.login", targetType: "user", targetId: user.id });
  return { token, user };
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const raw = `${id("sess")}.${crypto.randomBytes(24).toString("hex")}`;
  await db.run(`INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`, [
    id("ses"),
    sha256(raw),
    userId,
    now(),
    now() + SESSION_TTL,
  ]);
  return raw;
}

export async function userFromToken(db: Db, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const session = await db.get<{ user_id: string }>(
    `SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?`,
    [sha256(token), now()],
  );
  if (!session) return null;
  return (await db.get<User>(`SELECT * FROM users WHERE id = ?`, [session.user_id])) ?? null;
}

export async function destroySession(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.run(`DELETE FROM sessions WHERE token_hash = ?`, [sha256(token)]);
}

// Cookie attributes shared by set + clear. Browsers only clear a cookie when the
// clearing response's attributes (sameSite/secure/path) match those it was set with,
// so both helpers must use the same options.
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    path: "/",
  } as const;
}
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL });
}
export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE, cookieOptions());
}
export function readToken(req: Request): string | undefined {
  // web: httpOnly cookie · native (Capacitor): Authorization: Bearer <token>
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  return req.cookies?.[COOKIE] || bearer || undefined;
}

// --- middleware ---------------------------------------------------------------
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      db: Db;
      user: User | null;
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    req.user = await userFromToken(req.db, readToken(req));
    next();
  } catch (e) {
    next(e);
  }
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
export async function claimAccount(
  db: Db,
  user: User,
  patch: { name?: string; email?: string; phone?: string; marketing_consent?: boolean },
): Promise<User> {
  const name = patch.name?.trim() ?? user.name;
  const email = patch.email?.trim().toLowerCase() || user.email;
  const phone = patch.phone?.trim() || user.phone;
  if (email && email !== user.email) {
    const taken = await db.get(`SELECT id FROM users WHERE email = ? AND id != ?`, [email, user.id]);
    if (taken) throw new ApiError(409, "conflict", "That email is already in use");
  }
  if (phone && phone !== user.phone) {
    const taken = await db.get(`SELECT id FROM users WHERE phone = ? AND id != ?`, [phone, user.id]);
    if (taken) throw new ApiError(409, "conflict", "That number is already in use");
  }
  await db.run(`UPDATE users SET name = ?, email = ?, phone = ?, marketing_consent = ?, claimed = 1 WHERE id = ?`, [
    name,
    email,
    phone,
    patch.marketing_consent === undefined ? user.marketing_consent : patch.marketing_consent ? 1 : 0,
    user.id,
  ]);
  await audit(db, { actorUserId: user.id, action: "user.claimed", targetType: "user", targetId: user.id });
  return (await db.get<User>(`SELECT * FROM users WHERE id = ?`, [user.id]))!;
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
