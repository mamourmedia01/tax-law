import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { Errors } from "./lib.js";

// ---------------------------------------------------------------------------
// FW34 security hardening: rate limiting, security headers, and TOTP 2FA.
// ---------------------------------------------------------------------------

// In-memory fixed-window rate limiter (per IP + route bucket). For multi-instance
// production this would back onto Redis; the interface stays the same.
export function rateLimit(opts: { max: number; windowMs: number; bucket: string }) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
    const key = `${opts.bucket}:${ip}`;
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || rec.reset < now) {
      hits.set(key, { count: 1, reset: now + opts.windowMs });
      return next();
    }
    rec.count++;
    if (rec.count > opts.max) throw Errors.tooMany("Too many requests — slow down");
    next();
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Permissions-Policy", "geolocation=(self), microphone=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

// --- TOTP (RFC 6238, SHA-1, 30s step, 6 digits). Secret stored as hex. ---
export function totp(secretHex: string, t: number = Date.now(), step = 30): string {
  const counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", Buffer.from(secretHex, "hex")).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secretHex: string, code: string, window = 1): boolean {
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    if (totp(secretHex, now + i * 30_000) === code) return true;
  }
  return false;
}

export function newTotpSecret(): string {
  return crypto.randomBytes(20).toString("hex");
}
