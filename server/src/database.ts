import Database from "better-sqlite3";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { config } from "./lib.js";

// ---------------------------------------------------------------------------
// Async database abstraction with two backends:
//   - SQLite (better-sqlite3) for dev/tests — zero-config, fast, in-memory.
//   - Postgres (pg, pooled) for scale — async, multi-writer, no event-loop block.
//
// Service code is written against this single async interface using `?`
// placeholders; the Postgres adapter rewrites them to `$1..$n`.
// ---------------------------------------------------------------------------

export interface Db {
  readonly dialect: "sqlite" | "pg";
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  tx<T>(fn: (t: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// --- the schema (authored for SQLite, transformed for Postgres) --------------
const SQLITE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  claimed INTEGER NOT NULL DEFAULT 0,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  channel TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS otps_identifier ON otps(identifier);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  categories TEXT NOT NULL DEFAULT '[]',
  about TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  distance_km REAL NOT NULL DEFAULT 0,
  seed TEXT NOT NULL DEFAULT '5e8b96',
  tier TEXT NOT NULL DEFAULT 'solo',
  verified INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  price_from REAL NOT NULL DEFAULT 0,
  next_slot TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orgs_owner ON orgs(owner_user_id);

-- FW27 subscriptions (one per org). Tier changes flow through here and drive entitlements.
CREATE TABLE IF NOT EXISTS subscriptions (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',   -- active | canceled | past_due
  provider_ref TEXT,
  price REAL NOT NULL DEFAULT 0,
  current_period_end INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  kyc_status TEXT NOT NULL DEFAULT 'unstarted',
  asset_check INTEGER NOT NULL DEFAULT 0,
  hmrc_details INTEGER NOT NULL DEFAULT 0,
  payout_setup INTEGER NOT NULL DEFAULT 0,
  twofa INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER
);

CREATE TABLE IF NOT EXISTS theme_tokens (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (org_id, key)
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL,
  price REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS services_org ON services(org_id);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  rating INTEGER NOT NULL,
  text TEXT NOT NULL,
  date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_org ON reviews(org_id);

CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  before TEXT NOT NULL,
  after TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gallery_org ON gallery(org_id);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  pay_method TEXT NOT NULL DEFAULT 'cash',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_customer ON bookings(customer_user_id);
CREATE INDEX IF NOT EXISTS bookings_org ON bookings(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot ON bookings(org_id, date, time) WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS booking_services (
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_services_b ON booking_services(booking_id);

CREATE TABLE IF NOT EXISTS leads (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, customer_user_id)
);
CREATE INDEX IF NOT EXISTS leads_org ON leads(org_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  application_fee REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  payout_speed TEXT,                          -- 'standard' | 'instant' (in-app only)
  status TEXT NOT NULL,
  provider_ref TEXT,
  destination_account TEXT,
  created_at INTEGER NOT NULL,
  captured_at INTEGER,
  paid_out_at INTEGER,
  refunded_at INTEGER
);
CREATE INDEX IF NOT EXISTS payments_booking ON payments(booking_id);

CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key, scope)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta TEXT,
  created_at INTEGER NOT NULL
);
`;

// Postgres dialect: drop PRAGMAs, widen INTEGER→BIGINT (ms epochs overflow int4),
// REAL→DOUBLE PRECISION. Everything else (partial indexes, ON DELETE CASCADE) is portable.
function toPgSchema(s: string): string {
  return s
    .split("\n")
    .filter((l) => !l.trim().startsWith("PRAGMA"))
    .join("\n")
    .replace(/\bINTEGER\b/g, "BIGINT")
    .replace(/\bREAL\b/g, "DOUBLE PRECISION");
}

// --- SQLite adapter ----------------------------------------------------------
class SqliteDb implements Db {
  readonly dialect = "sqlite" as const;
  constructor(private raw: Database.Database) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.raw.prepare(sql).get(...(params as never[])) as T | undefined;
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.raw.prepare(sql).all(...(params as never[])) as T[];
  }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const info = this.raw.prepare(sql).run(...(params as never[]));
    return { changes: info.changes };
  }
  // All underlying ops are synchronous, so a manual BEGIN/COMMIT is safe: the
  // awaited chain inside `fn` resolves on the microtask queue before any other
  // request (a macrotask) runs, so transactions never interleave.
  async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
    this.raw.exec("BEGIN");
    try {
      const r = await fn(this);
      this.raw.exec("COMMIT");
      return r;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }
  async close(): Promise<void> {
    this.raw.close();
  }
}

// --- Postgres adapter --------------------------------------------------------
// Return BIGINT (int8, oid 20) as a JS number — our timestamps/counts fit safely.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type Queryable = pg.Pool | pg.PoolClient;

class PgDb implements Db {
  readonly dialect = "pg" as const;
  constructor(
    private pool: pg.Pool,
    private client?: pg.PoolClient,
  ) {}
  private q(): Queryable {
    return this.client ?? this.pool;
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const r = await this.q().query(toPgPlaceholders(sql), params as never[]);
    return r.rows[0] as T | undefined;
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.q().query(toPgPlaceholders(sql), params as never[]);
    return r.rows as T[];
  }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const r = await this.q().query(toPgPlaceholders(sql), params as never[]);
    return { changes: r.rowCount ?? 0 };
  }
  async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const bound = new PgDb(this.pool, client);
    try {
      await client.query("BEGIN");
      const r = await fn(bound);
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// --- factory -----------------------------------------------------------------
export async function openDb(opts?: { url?: string; sqlitePath?: string }): Promise<Db> {
  const url = opts?.url ?? config.databaseUrl;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: config.pgPoolMax });
    const db = new PgDb(pool);
    await pool.query(toPgSchema(SQLITE_SCHEMA));
    return db;
  }
  const file = opts?.sqlitePath ?? config.dbPath;
  if (file !== ":memory:") {
    const dir = path.dirname(file);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const raw = new Database(file);
  raw.pragma("foreign_keys = ON");
  raw.exec(SQLITE_SCHEMA);
  return new SqliteDb(raw);
}
