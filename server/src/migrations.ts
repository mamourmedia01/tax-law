import type { Db } from "./database.js";

// ---------------------------------------------------------------------------
// Ordered, tracked schema migrations.
//
// Each migration is authored once in SQLite dialect; the Postgres adapter is
// given the same SQL with INTEGER→BIGINT / REAL→DOUBLE PRECISION applied and
// PRAGMA lines stripped (see toPgSql). Applied migration ids are recorded in
// the schema_migrations ledger, so every migration runs exactly once, in order,
// each inside a transaction. Adding a column/table later = append a new entry;
// never edit a shipped migration in place.
//
// 0001_baseline IS the full original schema, authored with CREATE TABLE
// IF NOT EXISTS, so it is a safe no-op against any DB created before the ledger
// existed — that DB simply records 0001 as applied and continues from 0002+.
// ---------------------------------------------------------------------------

export interface Migration {
  id: string;
  /** SQLite-dialect SQL. Postgres gets the transformed form automatically. */
  sql: string;
}

const BASELINE = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  claimed INTEGER NOT NULL DEFAULT 0,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  admin_totp_secret TEXT,
  wallet_balance REAL NOT NULL DEFAULT 0,
  referral_code TEXT,
  referred_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_referral ON users(referral_code) WHERE referral_code IS NOT NULL;
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
  rebook_nudges INTEGER NOT NULL DEFAULT 0,
  vertical TEXT NOT NULL DEFAULT 'car-care',
  lat REAL NOT NULL DEFAULT 51.5074,
  lng REAL NOT NULL DEFAULT -0.1278,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orgs_owner ON orgs(owner_user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
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
  vehicle_reg TEXT,
  vehicle_desc TEXT,
  credit_applied REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_customer ON bookings(customer_user_id);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reg TEXT NOT NULL,
  make TEXT, model TEXT, colour TEXT, fuel TEXT,
  mot_status TEXT, mot_expiry TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vehicles_user ON vehicles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_user_reg ON vehicles(user_id, reg);
CREATE INDEX IF NOT EXISTS bookings_org ON bookings(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot ON bookings(org_id, date, time) WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS booking_services (
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_services_b ON booking_services(booking_id);

-- reviews reference bookings(id); declared after bookings so Postgres (which,
-- unlike SQLite, requires the referenced table to already exist) is satisfied.
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  rating INTEGER NOT NULL,
  text TEXT NOT NULL,
  date TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking ON reviews(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_org ON reviews(org_id);

CREATE TABLE IF NOT EXISTS leads (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, customer_user_id)
);
CREATE INDEX IF NOT EXISTS leads_org ON leads(org_id);

CREATE TABLE IF NOT EXISTS client_links (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, customer_user_id)
);

CREATE TABLE IF NOT EXISTS org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operative',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS org_members_org ON org_members(org_id);

CREATE TABLE IF NOT EXISTS provider_tax (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  application_fee REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  payout_speed TEXT,
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
  delivered_via TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS kyc_documents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  storage_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS kyc_documents_org ON kyc_documents(org_id);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  credits INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS packages_org ON packages(org_id);

CREATE TABLE IF NOT EXISTS package_purchases (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_remaining INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS package_purchases_cust ON package_purchases(customer_user_id);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  monthly_price REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS memberships_org ON memberships(org_id);

CREATE TABLE IF NOT EXISTS member_subscriptions (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS member_subscriptions_cust ON member_subscriptions(customer_user_id);

CREATE TABLE IF NOT EXISTS gift_cards (
  code TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  balance REAL NOT NULL,
  purchaser_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  redeemed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  redeemed_at INTEGER
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE IF NOT EXISTS b2b_enquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  fleet_size INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

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

// 0002: real UK bank-account details for payout setup. Raw sort code/account
// number are stored encrypted (sort_code_enc/account_number_enc via crypto.ts);
// only masked forms are kept in the clear for display. orgs already exists (in
// 0001_baseline) so the FK target is satisfied for Postgres.
const BANK_DETAILS = `
CREATE TABLE IF NOT EXISTS bank_accounts (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  account_holder_name TEXT NOT NULL,
  sort_code_enc TEXT NOT NULL,
  account_number_enc TEXT NOT NULL,
  sort_code_masked TEXT NOT NULL,
  account_number_masked TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

// 0003: geo + service-radius. Providers get a default service_radius_km; customers
// get a saved location (postcode + lat/lng); a per-(org,customer) override table
// lets a provider grant a named client an EXTENDED radius. orgs + users already
// exist (0001_baseline), so the FK target for the override table is satisfied for
// Postgres.
const GEO_RADIUS = `
ALTER TABLE orgs ADD COLUMN service_radius_km REAL NOT NULL DEFAULT 15;

ALTER TABLE users ADD COLUMN postcode TEXT;
ALTER TABLE users ADD COLUMN lat REAL;
ALTER TABLE users ADD COLUMN lng REAL;

CREATE TABLE IF NOT EXISTS client_radius_overrides (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  radius_km REAL NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, customer_user_id)
);
`;

// The ordered migration list. Append new migrations here; never edit a shipped one.
export const MIGRATIONS: Migration[] = [
  { id: "0001_baseline", sql: BASELINE },
  { id: "0002_bank_details", sql: BANK_DETAILS },
  { id: "0003_geo_radius", sql: GEO_RADIUS },
];

// Strip PRAGMAs, widen INTEGER→BIGINT and REAL→DOUBLE PRECISION for Postgres.
function toPgSql(s: string): string {
  return s
    .split("\n")
    .filter((l) => !l.trim().startsWith("PRAGMA"))
    .join("\n")
    .replace(/\bINTEGER\b/g, "BIGINT")
    .replace(/\bREAL\b/g, "DOUBLE PRECISION");
}

/** Strip `--` line comments, then split a DDL script into individual statements. */
function splitStatements(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .map((l) => {
      const i = l.indexOf("--");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
  return noComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Apply every pending migration, in order, each inside its own transaction,
 * recording applied ids in schema_migrations. Idempotent: already-applied
 * migrations are skipped. Returns the ids that were applied this run.
 */
export async function runMigrations(db: Db): Promise<string[]> {
  await db.run(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY,
       applied_at ${db.dialect === "pg" ? "BIGINT" : "INTEGER"} NOT NULL
     )`,
  );
  const done = new Set(
    (await db.all<{ id: string }>("SELECT id FROM schema_migrations")).map((r) => r.id),
  );
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    const sql = db.dialect === "pg" ? toPgSql(m.sql) : m.sql;
    await db.tx(async (t) => {
      // better-sqlite3 cannot run multiple statements through a prepared
      // statement, so split the script and run statements individually. We strip
      // `--` line comments first (they may contain `;`), then split on `;`. Our
      // DDL has no semicolons inside string literals, so this split is safe.
      for (const stmt of splitStatements(sql)) {
        await t.run(stmt);
      }
      await t.run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [m.id, Date.now()]);
    });
    applied.push(m.id);
  }
  return applied;
}
