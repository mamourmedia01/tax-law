import request from "supertest";
import { createDb, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { seedDatabase } from "../src/seed.js";
import { createSession } from "../src/auth.js";

export function freshApp() {
  const db: DB = createDb(":memory:");
  seedDatabase(db);
  const app = createApp(db);
  return { db, app };
}

export function orgId(db: DB, slug: string): string {
  return (db.prepare(`SELECT id FROM orgs WHERE slug = ?`).get(slug) as { id: string }).id;
}
export function ownerId(db: DB, slug: string): string {
  return (db.prepare(`SELECT owner_user_id FROM orgs WHERE slug = ?`).get(slug) as { owner_user_id: string })
    .owner_user_id;
}

// Mint a session cookie for an existing user (test-only shortcut around OTP).
export function cookieFor(db: DB, userId: string): string {
  return `fp_session=${createSession(db, userId)}`;
}

// Register a brand-new customer via the real OTP flow; returns an auth cookie + user id.
export async function registerCustomer(app: ReturnType<typeof createApp>, identifier: string) {
  const otp = await request(app).post("/api/auth/request-otp").send({ identifier });
  const code = otp.body.devCode as string;
  const verify = await request(app).post("/api/auth/verify-otp").send({ identifier, code });
  const cookie = verify.headers["set-cookie"][0].split(";")[0];
  return { cookie, user: verify.body.user };
}
