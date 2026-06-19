import request from "supertest";
import { openDb, type Db } from "../src/database.js";
import { createApp } from "../src/app.js";
import { seedDatabase } from "../src/seed.js";
import { createSession } from "../src/auth.js";

export type App = ReturnType<typeof createApp>;

export async function freshApp(): Promise<{ db: Db; app: App }> {
  const db = await openDb({ sqlitePath: ":memory:" });
  await seedDatabase(db);
  const app = createApp(db);
  return { db, app };
}

export async function orgId(db: Db, slug: string): Promise<string> {
  return (await db.get<{ id: string }>(`SELECT id FROM orgs WHERE slug = ?`, [slug]))!.id;
}
export async function ownerId(db: Db, slug: string): Promise<string> {
  return (await db.get<{ owner_user_id: string }>(`SELECT owner_user_id FROM orgs WHERE slug = ?`, [slug]))!
    .owner_user_id;
}

// Mint a session cookie for an existing user (test-only shortcut around OTP).
export async function cookieFor(db: Db, userId: string): Promise<string> {
  return `fp_session=${await createSession(db, userId)}`;
}

// Register a brand-new customer via the real OTP flow; returns an auth cookie + user id.
export async function registerCustomer(app: App, identifier: string) {
  const otp = await request(app).post("/api/auth/request-otp").send({ identifier });
  const code = otp.body.devCode as string;
  const verify = await request(app).post("/api/auth/verify-otp").send({ identifier, code });
  const cookie = verify.headers["set-cookie"][0].split(";")[0];
  return { cookie, user: verify.body.user };
}
