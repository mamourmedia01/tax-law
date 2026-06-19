# Fable+ — Stress Test (PART 10 Section 3)

A real load + logic-stress + integrity harness that boots the **actual backend**, seeds
platform-scale synthetic data, drives load over HTTP, runs the concurrency logic tests, and scans
the database for breakage. Runs against **either backend** (SQLite or Postgres).

```bash
cd server
npm run stress                                       # SQLite, 10k users
DATABASE_URL=postgres://… PG_POOL_MAX=50 npm run stress
USERS=50000 PROVIDERS=600 CONCURRENCY=300 npm run stress
```

## What it exercises
1. **Synthetic data** — N providers (+services+verification) and N customers.
2. **Scenario A — read load:** N concurrent `GET /providers` searches.
3. **Scenario B — write load:** N concurrent bookings across providers/slots.
4. **Scenario C — logic stress:** 500 clients race the *same* slot; 50 concurrent payments with the *same* idempotency key.
5. **Scenario D — cap edge case:** 25 new customers vs a Solo provider (cap 20).
6. **Integrity scan:** 8 invariants checked directly in the database afterwards.

---

## A real bug the stress test caught (and we fixed)

The first Postgres run **failed**: 50 concurrent payments with the same idempotency key created
**50 payment rows**. This never appeared on SQLite, which serialises everything — only Postgres's
true parallelism exposed it.

**Cause:** the idempotency guard was check-then-act — it did the work (created the payment) *before*
recording the key, so all 50 requests passed the "not seen yet" check and all executed.

**Fix:** a **claim-first** pattern (`server/src/payments.ts`) — the key is reserved atomically
(`INSERT … ON CONFLICT DO NOTHING`) *before* any work; only the winner runs the side-effecting
operation, and concurrent duplicates wait for and return the winner's stored result. Re-run: **1
payment row.** This is exactly why you stress test on the real datastore.

---

## Results

### 10,000 users — SQLite vs Postgres (apples-to-apples)

| Path | Metric | SQLite | Postgres | Change |
|---|---|--:|--:|--:|
| Bookings (write) | p50 | 241ms | 326ms | — |
| Bookings (write) | **p99** | **7,781ms** | **508ms** | **~15× faster** |
| Bookings (write) | max | 14,689ms | 557ms | ~26× faster |
| Search (read) | p99 | 11,509ms | 4,974ms | ~2.3× faster |
| Throughput | req/s | ~400–520 | ~615 | higher |
| Logic + integrity | | ✅ all pass | ✅ all pass | |

The SQLite tail latency came from its **synchronous single-writer** model blocking the event loop.
Postgres (async, pooled, multi-writer) removes the write wall: write p99 collapses from ~7.8s to
~0.5s.

### 50,000 users — Postgres

```
600 providers · 50,000 customers
Search (read)     50,000 req · p50 443ms · p95 487ms · p99 523ms · ~646 req/s
Bookings (write)  50,000 req · p50 510ms · p95 570ms · p99 619ms · ~600 req/s
                  43,400 concurrent slot collisions — all correctly rejected
slot race:        1 winner / 499 conflicts          ✅
payment idem:     50× same key → 1 payment row       ✅ (post-fix)
lead cap:         20 booked / 5 rejected             ✅
integrity scan:   8/8 ✅   (zero double-bookings, zero orphans, zero fee-bearing payments)
VERDICT: ✅ ALL PASS
```

At 50k users on a single Postgres instance + single app process, p99 stays ~0.5–0.6s with perfect
correctness — including **43,400 simultaneous slot collisions** all rejected with **zero
double-bookings**.

---

## Findings & the scale-up path

- **Correctness is concurrency-safe** on the real datastore (after the idempotency fix): no
  double-bookings, no double-charges, caps never exceeded, every booking source-tagged, no orphaned
  or fee-bearing rows — under tens of thousands of contended operations.
- **Postgres is the production datastore.** The driver swap (already isolated behind the `Db`
  interface in `server/src/database.ts`) removed the single-writer bottleneck; write p99 improved ~15×.
- **Next levers** for higher scale: run **multiple stateless app instances** behind a load balancer
  (sessions are cookie+DB based — already horizontal), add a **read cache** (Redis/CDN) for the
  catalog/search path (the read p99 tail is the remaining soft spot), and tune the connection pool /
  add `pgBouncer`. Re-run this harness after each change to prove the gain and catch regressions.
