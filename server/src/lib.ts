import crypto from "node:crypto";

// --- config -------------------------------------------------------------------
export const config = {
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DATABASE_PATH ?? "./data/fableplus.db",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-change-me-please-32+chars",
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim()),
  stripeKey: process.env.STRIPE_SECRET_KEY ?? "",
  otpChannel: process.env.OTP_CHANNEL ?? "console",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
};

// --- ids ----------------------------------------------------------------------
export function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

// short human-facing booking reference
export function ref(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += chars[bytes[i] % chars.length];
  return s;
}

// --- hashing ------------------------------------------------------------------
// One-way hash for OTP codes and tokens (we never store raw secrets — audit I36/I37).
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmac(input: string, secret = config.sessionSecret): string {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// 6-digit numeric OTP
export function otpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function now(): number {
  return Date.now();
}

// --- typed HTTP errors --------------------------------------------------------
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const Errors = {
  unauthorized: (m = "Not signed in") => new ApiError(401, "unauthorized", m),
  forbidden: (m = "Not allowed") => new ApiError(403, "forbidden", m),
  notFound: (m = "Not found") => new ApiError(404, "not_found", m),
  badRequest: (m = "Bad request") => new ApiError(400, "bad_request", m),
  conflict: (m = "Conflict") => new ApiError(409, "conflict", m),
  tooMany: (m = "Too many requests") => new ApiError(429, "too_many", m),
  payment: (m = "Payment error") => new ApiError(402, "payment_error", m),
};
