# Fable+ — Stress Test (PART 10 Section 3)

A real load + logic-stress + integrity harness that boots the **actual backend**, seeds
platform-scale synthetic data, drives 10k-user load over HTTP, runs the concurrency logic tests,
and scans the database for breakage.

```bash
cd server
npm run stress                                   # 10,000 users · 200 providers
USERS=20000 PROVIDERS=400 CONCURRENCY=300 npm run stress
```

## What it exercises

1. **Synthetic data** — 200 providers (+ services + verification), 10,000 customers.
2. **Scenario A — read load:** 10,000 concurrent `GET /providers` searches.
3. **Scenario B — write load:** 10,000 concurrent bookings spread across providers/slots.
4. **Scenario C — logic stress:** 500 clients race for the *same* slot; 50 concurrent payments with the *same* idempotency key.
5. **Scenario D — cap edge case:** 25 new marketplace customers against a Solo provider (cap 20).
6. **Integrity scan:** 8 invariants checked directly in the database after the run.

## Result — 10,000 users / 200 providers / concurrency 200

```
[2] GET /api/providers (search)
    10,000 requests · 10,000 ok · ~398 req/s
    latency  p50 281ms · p95 374ms · p99 11.5s · max 19.1s
[3] POST /api/bookings
    10,000 requests · 5,729 created · ~523 req/s
    rejected (correctly): 2,261 slot_taken · 2,010 lead_cap_reached
    latency  p50 241ms · p95 299ms · p99 7.8s · max 14.7s
[4] slot race:        500 clients → 1 winner, 499 conflicts        ✅ exactly one won
    payment idem:     50× same key  → 1 payment row                ✅ no double-charge
[5] lead cap:         25 new customers on Solo(20) → 20 booked      ✅ cap enforced
[6] integrity scan:   8/8 ✅
        ✅ No double-booked slots
        ✅ No orphaned bookings / payments
        ✅ Zero platform fee on every payment
        ✅ No in-app payment to an unverified provider
        ✅ Lead caps never exceeded (solo≤20, growth≤90)
        ✅ Every lead traces to a marketplace booking
        ✅ Every booking is source-tagged
    VERDICT: ✅ ALL PASS (correctness) — 5,751 bookings, 5,750 leads
```

## Headline findings

**Correctness held perfectly under load.** Zero double-bookings across ~2,261 genuine slot
collisions; zero double-charges across 50 concurrent same-key payments; lead caps never exceeded;
every booking source-tagged; no orphaned or fee-bearing rows. The invariants are concurrency-safe.

**The bottleneck is the sandbox datastore, not the logic.** Median latency is healthy
(p50 ≈ 240–280ms) but the p99 balloons to 8–19s at concurrency 200. Cause: the sandbox uses
**`better-sqlite3`, which is synchronous and single-writer** — every query blocks the Node event
loop, so 200 in-flight requests queue head-of-line. This is expected for a single-process SQLite
deployment and is the #1 thing to change before real scale.

## The scale-up path (before real 10k concurrent traffic)

1. **Swap SQLite → Postgres** with a connection pool. Removes the single-writer wall and the
   event-loop blocking; the data layer is already isolated behind the service modules, so this is a
   driver swap, not a rewrite.
2. **Run multiple stateless app instances** behind a load balancer (sessions are cookie+DB based, so
   the app already scales horizontally).
3. **Cache hot reads** (provider catalog/search) in Redis or at the CDN edge — Scenario A is pure
   read load and is the cheapest win.
4. **Keep writes idempotent + slot-unique** (already done) so retries under load stay safe.
5. Re-run this harness against Postgres to confirm p99 collapses.

> The harness is the deliverable as much as the numbers: re-run it after each scaling change to prove
> the fix, and after each feature to prove no regression.
