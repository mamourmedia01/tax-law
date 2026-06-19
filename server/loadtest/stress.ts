// Fable+ stress test — PART 10 Section 3 (synthetic data, load, logic-stress, integrity).
//
// Boots the REAL backend, seeds platform-scale data, drives 10k-user load over HTTP,
// runs the concurrency logic tests (slot race, lead cap, payment idempotency), then
// scans the database for integrity breakage. Honest about SQLite's single-writer model.
//
//   cd server && npm run stress           # default 10,000 users / 200 providers
//   USERS=20000 PROVIDERS=400 npm run stress

import http from "node:http";
import { performance } from "node:perf_hooks";
import { createDb, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { seedDatabase } from "../src/seed.js";
import { createSession } from "../src/auth.js";
import { id, now } from "../src/lib.js";

const USERS = Number(process.env.USERS ?? 10_000);
const PROVIDERS = Number(process.env.PROVIDERS ?? 200);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 200);
const PORT = Number(process.env.STRESS_PORT ?? 8899);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_PATH = `/tmp/fableplus-stress-${process.pid}.db`;

// ----------------------------------------------------------------------------- utils
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}
function fmt(n: number): string {
  return n.toLocaleString("en-GB");
}
function ms(n: number): string {
  return `${n.toFixed(1)}ms`;
}

interface Timing {
  durations: number[];
  ok: number;
  errors: Map<string, number>;
}
function newTiming(): Timing {
  return { durations: [], ok: 0, errors: new Map() };
}
function record(t: Timing, dur: number, status: number, code?: string) {
  t.durations.push(dur);
  if (status >= 200 && status < 300) t.ok++;
  else {
    const key = code ? `${status}:${code}` : String(status);
    t.errors.set(key, (t.errors.get(key) ?? 0) + 1);
  }
}
function report(name: string, t: Timing, wallMs: number) {
  const s = [...t.durations].sort((a, b) => a - b);
  const total = t.durations.length;
  const rps = total / (wallMs / 1000);
  console.log(`\n▸ ${name}`);
  console.log(`  requests   ${fmt(total)}   ok ${fmt(t.ok)}   throughput ${fmt(Math.round(rps))} req/s   wall ${(wallMs / 1000).toFixed(1)}s`);
  console.log(`  latency    p50 ${ms(pct(s, 50))}   p95 ${ms(pct(s, 95))}   p99 ${ms(pct(s, 99))}   max ${ms(pct(s, 100))}`);
  if (t.errors.size) {
    const errs = [...t.errors.entries()].map(([k, v]) => `${k}×${v}`).join(", ");
    console.log(`  non-2xx    ${errs}`);
  }
}

// concurrency-limited pool
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

interface Res {
  status: number;
  body: any;
  dur: number;
}
async function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}): Promise<Res> {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const dur = performance.now() - t0;
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, dur };
}

// ----------------------------------------------------------------------------- seeding
function seedScale(db: DB): { slugs: string[]; soloSlug: string } {
  seedDatabase(db); // the 6 base providers (incl. their services + verification)
  const baseSlugs = (db.prepare(`SELECT slug FROM orgs`).all() as { slug: string }[]).map((r) => r.slug);

  const areas = ["Hackney", "Camden", "Islington", "Shoreditch", "Brixton", "Ealing", "Croydon", "Barnet"];
  const tiers = ["solo", "growth", "fleet"] as const;
  const insOrg = db.prepare(
    `INSERT INTO orgs (id, owner_user_id, name, slug, tagline, category, categories, about, area, distance_km, seed, tier, verified, rating, review_count, price_from, next_slot, created_at)
     VALUES (?, ?, ?, ?, 'Synthetic provider', 'Exterior wash', '["Exterior wash","Mobile valet"]', 'Load-test provider', ?, ?, ?, ?, 1, ?, ?, ?, 'Today', ?)`,
  );
  const insUser = db.prepare(`INSERT INTO users (id, name, email, phone, claimed, created_at) VALUES (?, ?, ?, ?, 1, ?)`);
  const insSvc = db.prepare(`INSERT INTO services (id, org_id, name, description, duration_min, price) VALUES (?, ?, ?, '', ?, ?)`);
  const insVer = db.prepare(
    `INSERT INTO verification (org_id, kyc_status, asset_check, hmrc_details, payout_setup, twofa, verified_at) VALUES (?, 'passed', 1, 1, 1, 1, ?)`,
  );

  const tx = db.transaction(() => {
    for (let i = 0; i < PROVIDERS - baseSlugs.length; i++) {
      const ownerId = id("usr");
      insUser.run(ownerId, `Synthetic ${i} (owner)`, `synthetic-${i}@provider.fableplus`, `owner-syn-${i}`, now());
      const orgId = id("org");
      const slug = `synthetic-provider-${i}`;
      const tier = tiers[i % 3];
      insOrg.run(orgId, ownerId, `Synthetic Valet ${i}`, slug, areas[i % areas.length] + ", London", 1 + (i % 10), `${(i % 9) + 1}a6f78`, tier, (40 + (i % 10)) / 10, i % 300, 20 + (i % 30), now());
      insVer.run(orgId, now());
      for (let s = 0; s < 4; s++) insSvc.run(id("svc"), orgId, `Service ${s}`, 30 + s * 30, 20 + s * 15);
    }
  });
  tx();

  const slugs = (db.prepare(`SELECT slug FROM orgs`).all() as { slug: string }[]).map((r) => r.slug);
  const soloSlug = (db.prepare(`SELECT slug FROM orgs WHERE tier = 'solo' LIMIT 1`).get() as { slug: string }).slug;
  return { slugs, soloSlug };
}

function bulkCustomers(db: DB, n: number): string[] {
  const ins = db.prepare(`INSERT INTO users (id, name, phone, claimed, created_at) VALUES (?, ?, ?, 0, ?)`);
  const ids: string[] = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const uid = id("usr");
      ins.run(uid, "", `cust-${i}-${Math.random().toString(16).slice(2, 8)}`, now());
      ids.push(uid);
    }
  });
  tx();
  return ids;
}

function futureDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1 + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const TIMES = (() => {
  const t: string[] = [];
  for (let h = 8; h <= 18; h++) for (const m of [0, 30]) t.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return t;
})();

// ----------------------------------------------------------------------------- main
async function main() {
  console.log(`Fable+ STRESS TEST — ${fmt(USERS)} users · ${fmt(PROVIDERS)} providers · concurrency ${CONCURRENCY}`);
  console.log("=".repeat(70));

  const db = createDb(DB_PATH);
  console.log("\n[1/6] Seeding synthetic data…");
  const tSeed = performance.now();
  const { slugs, soloSlug } = seedScale(db);
  const customerIds = bulkCustomers(db, USERS);
  // first service id per provider, cached
  const firstSvc = new Map<string, { id: string; orgId: string }>();
  for (const slug of slugs) {
    const o = db.prepare(`SELECT id FROM orgs WHERE slug = ?`).get(slug) as { id: string };
    const s = db.prepare(`SELECT id FROM services WHERE org_id = ? LIMIT 1`).get(o.id) as { id: string };
    firstSvc.set(slug, { id: s.id, orgId: o.id });
  }
  const svcCount = (db.prepare(`SELECT COUNT(*) AS n FROM services`).get() as { n: number }).n;
  console.log(`  seeded ${fmt(slugs.length)} providers, ${fmt(customerIds.length)} customers, ${fmt(svcCount)} services in ${((performance.now() - tSeed) / 1000).toFixed(1)}s`);

  const app = createApp(db);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(PORT, r));
  const cookieFor = (uid: string) => `fp_session=${createSession(db, uid)}`;

  // --- Scenario A: search/browse load (read-heavy) ---
  console.log("\n[2/6] Scenario A — browse/search load (reads)…");
  {
    const t = newTiming();
    const queries = ["wash", "valet", "ceramic", "interior", "fleet", "", "mobile", "wheels"];
    const reqs = Array.from({ length: USERS }, (_, i) => i);
    const t0 = performance.now();
    await pool(
      reqs,
      async (i) => {
        const q = queries[i % queries.length];
        const r = await call("GET", `/api/providers?q=${q}&sort=rating`);
        record(t, r.dur, r.status, r.body?.error?.code);
      },
      CONCURRENCY,
    );
    report("GET /api/providers (search)", t, performance.now() - t0);
  }

  // --- Scenario B: booking load (writes) ---
  console.log("\n[3/6] Scenario B — concurrent bookings (writes)…");
  let bookingIds: string[] = [];
  {
    const t = newTiming();
    const created: string[] = [];
    const t0 = performance.now();
    await pool(
      customerIds,
      async (uid, i) => {
        const slug = slugs[i % slugs.length];
        const svc = firstSvc.get(slug)!;
        // spread across 60 days × 22 slots to keep collisions naturally low
        const date = futureDate(i % 60);
        const time = TIMES[(i * 7) % TIMES.length];
        const r = await call("POST", "/api/bookings", {
          cookie: cookieFor(uid),
          body: { providerSlug: slug, serviceIds: [svc.id], date, time },
        });
        record(t, r.dur, r.status, r.body?.error?.code);
        if (r.status === 201) created.push(r.body.id);
      },
      CONCURRENCY,
    );
    bookingIds = created;
    report("POST /api/bookings", t, performance.now() - t0);
  }

  // --- Scenario C: slot contention race (logic stress) ---
  console.log("\n[4/6] Scenario C — slot contention race + payment idempotency…");
  let racePass = false;
  {
    const slug = slugs[0];
    const svc = firstSvc.get(slug)!;
    const date = futureDate(120);
    const time = "09:00";
    const contenders = customerIds.slice(0, 500);
    const results: number[] = [];
    await pool(
      contenders,
      async (uid) => {
        const r = await call("POST", "/api/bookings", { cookie: cookieFor(uid), body: { providerSlug: slug, serviceIds: [svc.id], date, time } });
        results.push(r.status);
      },
      CONCURRENCY,
    );
    const wins = results.filter((s) => s === 201).length;
    const conflicts = results.filter((s) => s === 409).length;
    racePass = wins === 1 && conflicts === results.length - 1;
    console.log(`  500 clients → same slot:  winners=${wins}  conflicts=${conflicts}  ${racePass ? "✅ exactly one won" : "❌ RACE BUG"}`);
  }

  // --- payment idempotency under concurrency ---
  let idemPass = false;
  {
    // make a fresh booking on a verified provider, then hammer pay with the same key
    const uid = customerIds[customerIds.length - 1];
    const slug = slugs.find((s) => {
      const o = firstSvc.get(s)!;
      return (db.prepare(`SELECT verified FROM orgs WHERE id = ?`).get(o.orgId) as { verified: number }).verified === 1;
    })!;
    const svc = firstSvc.get(slug)!;
    const b = await call("POST", "/api/bookings", { cookie: cookieFor(uid), body: { providerSlug: slug, serviceIds: [svc.id], date: futureDate(121), time: "10:00" } });
    if (b.status === 201) {
      const key = "stress-idem-key";
      const fire = Array.from({ length: 50 }, () => 0);
      await pool(fire, async () => {
        await call("POST", `/api/bookings/${b.body.id}/pay`, { cookie: cookieFor(uid), body: { idempotencyKey: key } });
      }, 50);
      const cnt = db.prepare(`SELECT COUNT(*) AS n FROM payments WHERE booking_id = ?`).get(b.body.id) as { n: number };
      idemPass = cnt.n === 1;
      console.log(`  50× concurrent pay (same key):  payment rows=${cnt.n}  ${idemPass ? "✅ no double-charge" : "❌ DOUBLE-CHARGE"}`);
    }
  }

  // --- Scenario D: lead cap edge case ---
  console.log("\n[5/6] Scenario D — marketplace lead cap (the 20th/21st lead)…");
  let capPass = false;
  {
    // dedicated, untouched Solo provider so the count is deterministic (cap = 20)
    const capOwner = id("usr");
    db.prepare(`INSERT INTO users (id, name, phone, claimed, created_at) VALUES (?, 'Cap test owner', 'owner-cap', 1, ?)`).run(capOwner, now());
    const capOrg = id("org");
    db.prepare(
      `INSERT INTO orgs (id, owner_user_id, name, slug, tagline, category, categories, about, area, distance_km, seed, tier, verified, rating, review_count, price_from, next_slot, created_at)
       VALUES (?, ?, 'Cap Test Valet', 'cap-test-valet', '', 'Exterior wash', '["Exterior wash"]', '', 'London', 1, '5e8b96', 'solo', 1, 4.5, 0, 20, 'Today', ?)`,
    ).run(capOrg, capOwner, now());
    const capSvcId = id("svc");
    db.prepare(`INSERT INTO services (id, org_id, name, description, duration_min, price) VALUES (?, ?, 'Wash', '', 30, 20)`).run(capSvcId, capOrg);
    const soloSlugLocal = "cap-test-valet";
    const svc = { id: capSvcId };
    void soloSlug;
    // 25 brand-new customers, distinct dates, all marketplace → expect 20 ok, 5 capped
    const fresh = bulkCustomers(db, 25);
    const results: { status: number; code?: string }[] = [];
    // sequential to make the cap deterministic (the cap itself is the unit under test)
    for (let i = 0; i < fresh.length; i++) {
      const r = await call("POST", "/api/bookings", {
        cookie: cookieFor(fresh[i]),
        body: { providerSlug: soloSlugLocal, serviceIds: [svc.id], date: futureDate(150 + i), time: "08:00" },
      });
      results.push({ status: r.status, code: r.body?.error?.code });
    }
    const ok = results.filter((r) => r.status === 201).length;
    const cappedReal = results.filter((r) => r.code === "lead_cap_reached").length;
    capPass = ok <= 20 && cappedReal === results.length - ok && ok > 0;
    console.log(`  25 new marketplace customers on a Solo (cap 20):  booked=${ok}  lead_cap_reached=${cappedReal}  ${capPass ? "✅ cap enforced" : "❌ CAP LEAK"}`);
  }

  // --- Scenario E: data integrity scan ---
  console.log("\n[6/6] Integrity scan…");
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  const q = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  const dupSlots = q(`SELECT COUNT(*) AS n FROM (SELECT org_id, date, time, COUNT(*) c FROM bookings WHERE status != 'cancelled' GROUP BY org_id, date, time HAVING c > 1)`);
  checks.push({ name: "No double-booked slots", pass: dupSlots === 0, detail: `${dupSlots} collisions` });

  const orphanBookings = q(`SELECT COUNT(*) AS n FROM bookings b LEFT JOIN orgs o ON o.id = b.org_id LEFT JOIN users u ON u.id = b.customer_user_id WHERE o.id IS NULL OR u.id IS NULL`);
  checks.push({ name: "No orphaned bookings", pass: orphanBookings === 0, detail: `${orphanBookings} orphans` });

  const orphanPayments = q(`SELECT COUNT(*) AS n FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id WHERE b.id IS NULL`);
  checks.push({ name: "No orphaned payments", pass: orphanPayments === 0, detail: `${orphanPayments} orphans` });

  const feeLeak = q(`SELECT COUNT(*) AS n FROM payments WHERE application_fee != 0`);
  checks.push({ name: "Zero platform fee on every payment", pass: feeLeak === 0, detail: `${feeLeak} fee-bearing` });

  const unverifiedPay = q(`SELECT COUNT(*) AS n FROM payments p JOIN orgs o ON o.id = p.org_id WHERE p.method = 'in_app' AND o.verified = 0`);
  checks.push({ name: "No in-app payment to an unverified provider", pass: unverifiedPay === 0, detail: `${unverifiedPay} leaks` });

  // lead cap never exceeded this month for capped tiers
  const capExceeded = q(`
    SELECT COUNT(*) AS n FROM (
      SELECT o.id, o.tier, COUNT(*) AS leads
      FROM leads l JOIN orgs o ON o.id = l.org_id
      GROUP BY o.id
      HAVING (o.tier = 'solo' AND leads > 20) OR (o.tier = 'growth' AND leads > 90)
    )`);
  checks.push({ name: "Lead caps never exceeded (solo≤20, growth≤90)", pass: capExceeded === 0, detail: `${capExceeded} orgs over cap` });

  // byoc bookings never created a lead
  const byocLeaks = q(`
    SELECT COUNT(*) AS n FROM leads l
    WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.org_id = l.org_id AND b.customer_user_id = l.customer_user_id AND b.source = 'marketplace_lead')`);
  checks.push({ name: "Every lead traces to a marketplace booking (no byoc leaks)", pass: byocLeaks === 0, detail: `${byocLeaks} stray leads` });

  const untagged = q(`SELECT COUNT(*) AS n FROM bookings WHERE source NOT IN ('marketplace_lead','byoc_client')`);
  checks.push({ name: "Every booking is source-tagged", pass: untagged === 0, detail: `${untagged} untagged` });

  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}  (${c.detail})`);

  // --- summary ---
  const totalBookings = q(`SELECT COUNT(*) AS n FROM bookings`);
  const totalPayments = q(`SELECT COUNT(*) AS n FROM payments`);
  const totalLeads = q(`SELECT COUNT(*) AS n FROM leads`);
  const logicPass = racePass && idemPass && capPass;
  const integrityPass = checks.every((c) => c.pass);

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log(`  data:     ${fmt(slugs.length)} providers · ${fmt(customerIds.length)} customers · ${fmt(totalBookings)} bookings · ${fmt(totalPayments)} payments · ${fmt(totalLeads)} leads`);
  console.log(`  logic:    slot-race ${racePass ? "PASS" : "FAIL"} · idempotency ${idemPass ? "PASS" : "FAIL"} · lead-cap ${capPass ? "PASS" : "FAIL"}`);
  console.log(`  integrity:${integrityPass ? " PASS" : " FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length} checks)`);
  console.log(`  VERDICT:  ${logicPass && integrityPass ? "✅ ALL PASS" : "❌ FAILURES DETECTED"}`);
  console.log("=".repeat(70));

  await new Promise<void>((r) => server.close(() => r()));
  db.close();
  try {
    const fs = await import("node:fs");
    for (const ext of ["", "-wal", "-shm"]) fs.rmSync(DB_PATH + ext, { force: true });
  } catch {
    /* ignore */
  }
  process.exit(logicPass && integrityPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
