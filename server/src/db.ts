import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- People. Customers and provider-owners are both users. Guests are users with claimed=0.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  claimed INTEGER NOT NULL DEFAULT 0,          -- 0 = guest (auto-created), 1 = claimed account
  marketing_consent INTEGER NOT NULL DEFAULT 0, -- two-bucket consent (I32): separate from transactional
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email IS NOT NULL;

-- OTP codes. We store only a hash (I36: no secrets at rest in the clear).
CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,    -- the phone/email the code was sent to
  channel TEXT NOT NULL,       -- 'phone' | 'email'
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Sessions. Cookie carries an opaque token; we store only its hash.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Provider organisations (one subscription per org — I9).
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  categories TEXT NOT NULL DEFAULT '[]',  -- JSON array
  about TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  distance_km REAL NOT NULL DEFAULT 0,
  seed TEXT NOT NULL DEFAULT '5e8b96',
  tier TEXT NOT NULL DEFAULT 'solo',      -- solo | growth | fleet
  verified INTEGER NOT NULL DEFAULT 0,    -- derived from verification (I21) — never set directly
  rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  price_from REAL NOT NULL DEFAULT 0,
  next_slot TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- Verification state machine (I20/I21). Verified badge only when ALL are complete.
CREATE TABLE IF NOT EXISTS verification (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  kyc_status TEXT NOT NULL DEFAULT 'unstarted',  -- unstarted | pending | passed | failed
  asset_check INTEGER NOT NULL DEFAULT 0,
  hmrc_details INTEGER NOT NULL DEFAULT 0,        -- HMRC seller data collected (compliance)
  payout_setup INTEGER NOT NULL DEFAULT 0,        -- Stripe Connect payout account
  twofa INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER
);

-- Storefront theme tokens (FW29). Theming is DATA, not code (I16). Scoped to one org (I17).
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

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  rating INTEGER NOT NULL,
  text TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  before TEXT NOT NULL,
  after TEXT NOT NULL
);

-- Bookings. Every booking is tagged with its source (I2).
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                 -- 'marketplace_lead' | 'byoc_client'
  date TEXT NOT NULL,                   -- yyyy-mm-dd
  time TEXT NOT NULL,                   -- HH:mm
  duration_min INTEGER NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',  -- confirmed | completed | cancelled
  pay_method TEXT NOT NULL DEFAULT 'cash',   -- in_app | cash
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_customer ON bookings(customer_user_id);
CREATE INDEX IF NOT EXISTS bookings_org ON bookings(org_id);
-- A slot per org can only be taken once (no double-booking — enforced by unique index).
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot
  ON bookings(org_id, date, time) WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS booking_services (
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL
);

-- Marketplace leads. One row = one marketplace-introduced customer for an org.
-- Repeat bookings from the same customer do NOT create a new lead (they're now a client).
CREATE TABLE IF NOT EXISTS leads (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, customer_user_id)
);

-- Payments. No-custody: platform balance is always zero (I12). Funds settle to the
-- provider's connected account. Cash is a status flag with no money movement (I15).
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  application_fee REAL NOT NULL DEFAULT 0,   -- ALWAYS 0 on consumer charges (I3 / no-commission)
  method TEXT NOT NULL,                      -- in_app | cash
  status TEXT NOT NULL,                      -- requires_capture | captured | paid_out | refunded | failed
  provider_ref TEXT,                         -- sandbox/Stripe PaymentIntent id
  destination_account TEXT,                  -- provider connected account (funds destination)
  created_at INTEGER NOT NULL,
  captured_at INTEGER,
  paid_out_at INTEGER,
  refunded_at INTEGER
);

-- Generic idempotency store (I14: no double-charge / no duplicate side effects).
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key, scope)
);

-- Notifications with two buckets (I32).
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,           -- 'transactional' | 'marketing'
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);

-- Immutable audit log. No sensitive payloads (I6/I36).
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta TEXT,                       -- JSON; must not contain personal/special-category data
  created_at INTEGER NOT NULL
);
`;

export function createDb(dbPath: string): DB {
  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
