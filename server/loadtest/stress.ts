// Fable+ stress test — PART 10 Section 3 (synthetic data, load, logic-stress, integrity).
//
// Boots the REAL backend, seeds platform-scale data, drives load over HTTP, runs the
// concurrency logic tests, then scans the database for integrity breakage.
//
//   cd server && npm run stress                          # SQLite, 10k users
//   DATABASE_URL=postgres://… npm run stress             # Postgres
//   USERS=50000 PROVIDERS=600 CONCURRENCY=300 npm run stress

import http from "node:http";
import { performance } from "node:perf_hooks";
import { openDb, type Db } from "../src/database.js";
import { createApp } from "../src/app.js";
import { seedDatabase } from "../src/seed.js";
import { createSession } from "../src/auth.js";
import { config, id, now } from "../src/lib.js";

const USERS = Number(process.env.USERS ?? 10_000);
const PROVIDERS = Number(process.env.PROVIDERS ?? 200);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 200);
const PORT = Number(process.env.STRESS_PORT ?? 8899);
const BASE = `http://127.0.0.1:${PORT}`;
const SQLITE_PATH = `/tmp/fableplus-stress-${process.pid}.db`;

function pctl(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
const fmt = (n: number) => n.toLocaleString("en-GB");
const msf = (n: number) => `${n.toFixed(1)}ms`;

interface Timing {
  durations: number[];
  ok: number;
  errors: Map<string, number>;
}
const newTiming = (): Timing => ({ durations: [], ok: 0, errors: new Map() });
function record(t: Timing, dur: number, status: number, code?: string) {
  t.durations.push(dur);
  if (status >= 200 && status < 300) t.ok++;
  else t.errors.set(code ? `${status}:${code}` : String(status), (t.errors.get(code ? `${status}:${code}` : String(status)) ?? 0) + 1);
}
function report(name: string, t: Timing, wallMs: number) {
  const s = [...t.durations].sort((a, b) => a - b);
  const rps = t.durations.length / (wallMs / 1000);
  console.log(`\n▸ ${name}`);
  console.log(`  requests   ${fmt(t.durations.length)}   ok ${fmt(t.ok)}   throughput ${fmt(Math.round(rps))} req/s   wall ${(wallMs / 1000).toFixed(1)}s`);
  console.log(`  latency    p50 ${msf(pctl(s, 50))}   p95 ${msf(pctl(s, 95))}   p99 ${msf(pctl(s, 99))}   max ${msf(pctl(s, 100))}`);
  if (t.errors.size) console.log(`  non-2xx    ${[...t.errors.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}`);
}

async function pool<T>(items: T[], worker: (item: T, i: number) => Promise<void>, concurrency: number) {
  let idx = 0;
  const run = async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

async function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const dur = performance.now() - t0;
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, dur };
}

const TIMES = (() => {
  const t: string[] = [];
  for (let h = 8; h <= 18; h++) for (const m of [0, 30]) t.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return t;
})();
function futureDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1 + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function wipe(db: Db) {
  const tables = [
    "audit_log", "notifications", "idempotency", "payments", "leads", "booking_services",
    "bookings", "gallery", "reviews", "services", "theme_tokens", "verification", "orgs",
    "sessions", "otps", "users",
  ];
  if (db.dialect === "pg") await db.run(`TRUNCATE ${tables.join(", ")} CASCADE`);
  else for (const tbl of tables) await db.run(`DELETE FROM ${tbl}`);
}

async function seedScale(db: Db): Promise<string[]> {
  await seedDatabase(db);
  const baseCount = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM orgs`))!.n;
  const areas = ["Hackney", "Camden", "Islington", "Shoreditch", "Brixton", "Ealing", "Croydon", "Barnet"];
  const tiers = ["solo", "growth", "fleet"] as const;
  await db.tx(async (t) => {
    for (let i = 0; i < PROVIDERS - Number(baseCount); i++) {
      const ownerId = id("usr");
      await t.run(`INSERT INTO users (id, name, email, phone, claimed, created_at) VALUES (?, ?, ?, ?, 1, ?)`, [
        ownerId, `Synthetic ${i} (owner)`, `synthetic-${i}@provider.fableplus`, `owner-syn-${i}`, now(),
      ]);
      const orgId = id("org");
      await t.run(
        `INSERT INTO orgs (id, owner_user_id, name, slug, tagline, category, categories, about, area, distance_km, seed, tier, verified, rating, review_count, price_from, next_slot, created_at)
         VALUES (?, ?, ?, ?, 'Synthetic provider', 'Exterior wash', '["Exterior wash","Mobile valet"]', 'Load-test provider', ?, ?, ?, ?, 1, ?, ?, ?, 'Today', ?)`,
        [orgId, ownerId, `Synthetic Valet ${i}`, `synthetic-provider-${i}`, areas[i % areas.length] + ", London", 1 + (i % 10), `${(i % 9) + 1}a6f78`, tiers[i % 3], (40 + (i % 10)) / 10, i % 300, 20 + (i % 30), now()],
      );
      await t.run(`INSERT INTO verification (org_id, kyc_status, asset_check, hmrc_details, payout_setup, twofa, verified_at) VALUES (?, 'passed', 1, 1, 1, 1, ?)`, [orgId, now()]);
      for (let s = 0; s < 4; s++) await t.run(`INSERT INTO services (id, org_id, name, description, duration_min, price) VALUES (?, ?, ?, '', ?, ?)`, [id("svc"), orgId, `Service ${s}`, 30 + s * 30, 20 + s * 15]);
    }
  });
  return (await db.all<{ slug: string }>(`SELECT slug FROM orgs`)).map((r) => r.slug);
}

async function bulkCustomers(db: Db, n: number): Promise<string[]> {
  const ids: string[] = [];
  await db.tx(async (t) => {
    for (let i = 0; i < n; i++) {
      const uid = id("usr");
      await t.run(`INSERT INTO users (id, name, phone, claimed, created_at) VALUES (?, '', ?, 0, ?)`, [uid, `cust-${uid}`, now()]);
      ids.push(uid);
    }
  });
  return ids;
}

async function main() {
  console.log(`Fable+ STRESS TEST — ${fmt(USERS)} users · ${fmt(PROVIDERS)} providers · concurrency ${CONCURRENCY}`);
  const usePg = !!config.databaseUrl;
  const db = await openDb(usePg ? {} : { sqlitePath: SQLITE_PATH });
  console.log(`db backend: ${db.dialect.toUpperCase()}${usePg ? "" : ` (${SQLITE_PATH})`}`);
  console.log("=".repeat(70));

  console.log("\n[1/6] Seeding synthetic data…");
  const tSeed = performance.now();
  await wipe(db);
  const slugs = await seedScale(db);
  const customerIds = await bulkCustomers(db, USERS);
  const firstSvc = new Map<string, { id: string; orgId: string }>();
  for (const slug of slugs) {
    const o = (await db.get<{ id: string }>(`SELECT id FROM orgs WHERE slug = ?`, [slug]))!;
    const s = (await db.get<{ id: string }>(`SELECT id FROM services WHERE org_id = ? LIMIT 1`, [o.id]))!;
    firstSvc.set(slug, { id: s.id, orgId: o.id });
  }
  // pre-mint one session per customer (realistic: a user has one session)
  const cookies: string[] = [];
  await db.tx(async (t) => {
    for (const uid of customerIds) cookies.push(`fp_session=${await createSession(t, uid)}`);
  });
  const svcCount = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM services`))!.n;
  console.log(`  seeded ${fmt(slugs.length)} providers, ${fmt(customerIds.length)} customers, ${fmt(Number(svcCount))} services in ${((performance.now() - tSeed) / 1000).toFixed(1)}s`);

  const app = createApp(db);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(PORT, r));

  // --- Scenario A: reads ---
  console.log("\n[2/6] Scenario A — browse/search load (reads)…");
  {
    const t = newTiming();
    const queries = ["wash", "valet", "ceramic", "interior", "fleet", "", "mobile", "wheels"];
    const t0 = performance.now();
    await pool(Array.from({ length: USERS }, (_, i) => i), async (i) => {
      const r = await call("GET", `/api/providers?q=${queries[i % queries.length]}&sort=rating`);
      record(t, r.dur, r.status, r.body?.error?.code);
    }, CONCURRENCY);
    report("GET /api/providers (search)", t, performance.now() - t0);
  }

  // --- Scenario B: writes ---
  console.log("\n[3/6] Scenario B — concurrent bookings (writes)…");
  {
    const t = newTiming();
    const t0 = performance.now();
    await pool(customerIds, async (uid, i) => {
      const slug = slugs[i % slugs.length];
      const svc = firstSvc.get(slug)!;
      const r = await call("POST", "/api/bookings", {
        cookie: cookies[i],
        body: { providerSlug: slug, serviceIds: [svc.id], date: futureDate(i % 60), time: TIMES[(i * 7) % TIMES.length] },
      });
      record(t, r.dur, r.status, r.body?.error?.code);
    }, CONCURRENCY);
    report("POST /api/bookings", t, performance.now() - t0);
  }

  // --- Scenario C: slot race + payment idempotency ---
  console.log("\n[4/6] Scenario C — slot contention race + payment idempotency…");
  let racePass = false;
  {
    const slug = slugs[0];
    const svc = firstSvc.get(slug)!;
    const date = futureDate(120);
    const idxs = Array.from({ length: 500 }, (_, k) => k);
    const results: number[] = [];
    await pool(idxs, async (k) => {
      const r = await call("POST", "/api/bookings", { cookie: cookies[k], body: { providerSlug: slug, serviceIds: [svc.id], date, time: "09:00" } });
      results.push(r.status);
    }, CONCURRENCY);
    const wins = results.filter((s) => s === 201).length;
    const conflicts = results.filter((s) => s === 409).length;
    racePass = wins === 1 && conflicts === results.length - 1;
    console.log(`  500 clients → same slot:  winners=${wins}  conflicts=${conflicts}  ${racePass ? "✅ exactly one won" : "❌ RACE BUG"}`);
  }

  let idemPass = false;
  {
    const uid = customerIds[customerIds.length - 1];
    const cookie = `fp_session=${await createSession(db, uid)}`;
    const slug = slugs[0];
    const svc = firstSvc.get(slug)!;
    const b = await call("POST", "/api/bookings", { cookie, body: { providerSlug: slug, serviceIds: [svc.id], date: futureDate(121), time: "10:00" } });
    if (b.status === 201) {
      await pool(Array.from({ length: 50 }, () => 0), async () => {
        await call("POST", `/api/bookings/${b.body.id}/pay`, { cookie, body: { idempotencyKey: "stress-idem-key" } });
      }, 50);
      const cnt = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM payments WHERE booking_id = ?`, [b.body.id]))!.n;
      idemPass = Number(cnt) === 1;
      console.log(`  50× concurrent pay (same key):  payment rows=${cnt}  ${idemPass ? "✅ no double-charge" : "❌ DOUBLE-CHARGE"}`);
    }
  }

  // --- Scenario D: lead cap edge case (dedicated Solo provider) ---
  console.log("\n[5/6] Scenario D — marketplace lead cap (the 20th/21st lead)…");
  let capPass = false;
  {
    const capOwner = id("usr");
    await db.run(`INSERT INTO users (id, name, phone, claimed, created_at) VALUES (?, 'Cap owner', ?, 1, ?)`, [capOwner, `owner-cap-${capOwner}`, now()]);
    const capOrg = id("org");
    await db.run(
      `INSERT INTO orgs (id, owner_user_id, name, slug, tagline, category, categories, about, area, distance_km, seed, tier, verified, rating, review_count, price_from, next_slot, created_at)
       VALUES (?, ?, 'Cap Test Valet', ?, '', 'Exterior wash', '["Exterior wash"]', '', 'London', 1, '5e8b96', 'solo', 1, 4.5, 0, 20, 'Today', ?)`,
      [capOrg, capOwner, `cap-test-valet-${capOrg}`, now()],
    );
    const capSvc = id("svc");
    await db.run(`INSERT INTO services (id, org_id, name, description, duration_min, price) VALUES (?, ?, 'Wash', '', 30, 20)`, [capSvc, capOrg]);
    const capSlug = (await db.get<{ slug: string }>(`SELECT slug FROM orgs WHERE id = ?`, [capOrg]))!.slug;
    const fresh = await bulkCustomers(db, 25);
    const results: { status: number; code?: string }[] = [];
    for (let i = 0; i < fresh.length; i++) {
      const cookie = `fp_session=${await createSession(db, fresh[i])}`;
      const r = await call("POST", "/api/bookings", { cookie, body: { providerSlug: capSlug, serviceIds: [capSvc], date: futureDate(150 + i), time: "08:00" } });
      results.push({ status: r.status, code: r.body?.error?.code });
    }
    const ok = results.filter((r) => r.status === 201).length;
    const capped = results.filter((r) => r.code === "lead_cap_reached").length;
    capPass = ok === 20 && capped === 5;
    console.log(`  25 new marketplace customers on a Solo (cap 20):  booked=${ok}  lead_cap_reached=${capped}  ${capPass ? "✅ cap enforced" : "❌ CAP LEAK"}`);
  }

  // --- Scenario E: integrity scan ---
  console.log("\n[6/6] Integrity scan…");
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  const q = async (sql: string) => Number((await db.get<{ n: number }>(sql))!.n);

  checks.push({ name: "No double-booked slots", pass: (await q(`SELECT COUNT(*) AS n FROM (SELECT org_id, date, time, COUNT(*) c FROM bookings WHERE status != 'cancelled' GROUP BY org_id, date, time HAVING COUNT(*) > 1) x`)) === 0, detail: "collisions" });
  checks.push({ name: "No orphaned bookings", pass: (await q(`SELECT COUNT(*) AS n FROM bookings b LEFT JOIN orgs o ON o.id=b.org_id LEFT JOIN users u ON u.id=b.customer_user_id WHERE o.id IS NULL OR u.id IS NULL`)) === 0, detail: "orphans" });
  checks.push({ name: "No orphaned payments", pass: (await q(`SELECT COUNT(*) AS n FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id WHERE b.id IS NULL`)) === 0, detail: "orphans" });
  checks.push({ name: "Zero platform fee on every payment", pass: (await q(`SELECT COUNT(*) AS n FROM payments WHERE application_fee != 0`)) === 0, detail: "fee-bearing" });
  checks.push({ name: "No in-app payment to an unverified provider", pass: (await q(`SELECT COUNT(*) AS n FROM payments p JOIN orgs o ON o.id=p.org_id WHERE p.method='in_app' AND o.verified=0`)) === 0, detail: "leaks" });
  checks.push({ name: "Lead caps never exceeded (solo≤20, growth≤90)", pass: (await q(`SELECT COUNT(*) AS n FROM (SELECT o.id FROM leads l JOIN orgs o ON o.id=l.org_id GROUP BY o.id, o.tier HAVING (o.tier='solo' AND COUNT(*)>20) OR (o.tier='growth' AND COUNT(*)>90)) x`)) === 0, detail: "orgs over cap" });
  checks.push({ name: "Every lead traces to a marketplace booking", pass: (await q(`SELECT COUNT(*) AS n FROM leads l WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.org_id=l.org_id AND b.customer_user_id=l.customer_user_id AND b.source='marketplace_lead')`)) === 0, detail: "stray leads" });
  checks.push({ name: "Every booking is source-tagged", pass: (await q(`SELECT COUNT(*) AS n FROM bookings WHERE source NOT IN ('marketplace_lead','byoc_client')`)) === 0, detail: "untagged" });
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);

  const totalBookings = await q(`SELECT COUNT(*) AS n FROM bookings`);
  const totalPayments = await q(`SELECT COUNT(*) AS n FROM payments`);
  const totalLeads = await q(`SELECT COUNT(*) AS n FROM leads`);
  const logicPass = racePass && idemPass && capPass;
  const integrityPass = checks.every((c) => c.pass);

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log(`  backend:  ${db.dialect.toUpperCase()}`);
  console.log(`  data:     ${fmt(slugs.length)} providers · ${fmt(customerIds.length)} customers · ${fmt(totalBookings)} bookings · ${fmt(totalPayments)} payments · ${fmt(totalLeads)} leads`);
  console.log(`  logic:    slot-race ${racePass ? "PASS" : "FAIL"} · idempotency ${idemPass ? "PASS" : "FAIL"} · lead-cap ${capPass ? "PASS" : "FAIL"}`);
  console.log(`  integrity:${integrityPass ? " PASS" : " FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length})`);
  console.log(`  VERDICT:  ${logicPass && integrityPass ? "✅ ALL PASS" : "❌ FAILURES DETECTED"}`);
  console.log("=".repeat(70));

  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
  if (!usePg) {
    const fs = await import("node:fs");
    for (const ext of ["", "-wal", "-shm"]) fs.rmSync(SQLITE_PATH + ext, { force: true });
  }
  process.exit(logicPass && integrityPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
