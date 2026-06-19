# Fable+ — Build Audit Status (PART 10 checklist)

This maps the master build pack's **PART 10 — Build Audit & Pre-Launch Test Checklist** to what is
actually built in this repo. It is updated as features land.

**Legend:** ✅ built & tested (sandbox) · 🟡 partial · ⬜ not built · 🔒 needs a qualified human before
go-live (an automated/sandbox check is a first pass only, never the sign-off)

> **What "sandbox" means here.** Everything runs against a real backend (Express + SQLite) with real,
> enforced logic. External services with no live credentials (Stripe, SMS/OTP delivery, KYC, the LLM)
> use **in-process sandbox adapters** that model the real provider's behaviour and are swap-ready —
> drop *test-mode* keys into `server/.env` to exercise the real providers. No live rails are touched.

Run the evidence: `cd server && npm install && npm test` (18 invariant tests).

---

## Section 1 — CRITICAL (human-verify required)

| Item | Status | Evidence / notes |
|---|---|---|
| **1.1** Customer A cannot read Customer B's data (id-iteration, every endpoint) | ✅🔒 | Every query is owner-scoped; reads fail **closed** (404, never another tenant's row). `test/isolation.test.ts`. |
| 1.1 Provider A cannot see Provider B's clients/bookings/earnings | ✅🔒 | `requireOrg` + per-org scoping; `getBooking`/payments check ownership. |
| 1.1 Removing a scope filter fails closed | ✅🔒 | Reads return not-found by default; tested via cross-tenant read. |
| 1.1 Admin god-view only cross-tenant access, 2FA-gated, logged | 🟡🔒 | `is_admin` flag + `requireAdmin` exist; god-view UI/2FA not built. |
| 1.1 No personal data in logs | ✅🔒 | Audit log stores ids/counts/statuses only (`audit.ts`); OTP/secrets stored hashed. |
| 1.1 Secrets vaulted, none in repo | ✅🔒 | All secrets via env (`.env.example`); `.env` git-ignored; nothing committed. |
| 1.1 TLS + encryption at rest | ⬜🔒 | Deployment concern (terminate TLS at the edge; encrypted volume). Not configured here. |
| 1.1 OWASP Top 10 pass | 🟡🔒 | Parameterised SQL (no injection), access control enforced & tested, input validation (zod). Full pen-test = human. |
| **1.2** Money never lands in a platform balance | ✅🔒 | Destination-charge model: funds → `acct_<org>`, `application_fee` always 0. `payments.ts`, `test/payments.test.ts`. |
| 1.2 Unverified provider cannot take in-app payment (any path) | ✅🔒 | Server rejects authorize unless org verified **and** payout set up. Tested. |
| 1.2 AI cannot touch money movement | ✅🔒 | `ai.ts` has no payment import/call path (structural). |
| 1.2 auth→capture→payout state machine; no double-capture | ✅🔒 | `requires_capture → paid_out`; capture is owner-gated & idempotent. Tested. |
| 1.2 Idempotency — no double-charge | ✅🔒 | Generic idempotency store; same key returns same payment. `test/payments.test.ts`. |
| **1.3** Verified badge only when ALL steps complete | ✅🔒 | Badge is **derived** (`verification.ts` `recompute`) from kyc+asset+hmrc+payout+2FA; never set directly. |
| 1.3 Only verified providers take in-app payments / (badge) | ✅🔒 | Enforced in payments + surfaced in catalog. |
| 1.3 KYC docs encrypted, never in logs/AI | 🟡🔒 | Sandbox KYC stores status only (no docs); real doc storage = human + provider integration. |
| **1.4** Account deletion wipes every store | ✅🔒 | `gdpr.ts` cascades users→bookings/payments/notifications/leads/sessions; OTPs cleared; audit anonymised. Tested. |
| 1.4 Data export | ✅🔒 | `/api/account/export`; downloadable from Profile. Tested. |
| 1.4 Marketing consent separate from transactional, withdrawable | ✅🔒 | Two-bucket model; transactional always sends, marketing gated by consent. `notifications.ts`. |
| 1.4 HMRC seller data collected at verification | 🟡🔒 | `hmrc_details` step in verification machine; annual-report export not built. |
| 1.4 Immutable audit log, no sensitive payloads | ✅🔒 | Append-only `audit_log`; ids/counts only. |
| 1.4 Solicitor review of ToS/Privacy & employment/FCA position | ⬜🔒 | Legal sign-off — out of scope of code. |
| **1.5** AI grounded in user's own data | ✅🔒 | Copilot reads only the org's rows; emits only data-backed figures, won't fabricate. `ai.ts`, `test/gdpr-theming.test.ts`. |
| 1.5 AI suggests, never auto-acts | ✅🔒 | Output is suggestions with an `action` label for human approval; `suggestNeverAct: true`. |
| 1.5 AI never reads cross-tenant data | ✅🔒 | Org-scoped queries only. |
| 1.5 Bias monitoring | ⬜🔒 | Not built. |

## Section 2 — Self-audit (lower-stakes correctness)

| Item | Status | Evidence |
|---|---|---|
| 2.1 Every booking tagged `marketplace_lead` / `byoc_client` | ✅ | `bookings.ts`; `test/bookings.test.ts`. |
| 2.1 Leads decrement allowance; own-client unlimited & never decrement | ✅ | Lead consumed only for a new marketplace customer; byoc never creates a lead. Tested. |
| 2.1 No double-booking of a slot | ✅ | Unique partial index `bookings_slot`; returns `slot_taken`. Tested. |
| 2.1 Guest checkout, OTP only, account auto-created & claimable; claim keeps data | ✅ | `auth.ts`; OTP flow in the booking UI; `test/auth.test.ts`. |
| 2.2 One subscription per org; entitlements from tier | ✅ | `orgs.tier` + `entitlements.ts`. |
| 2.2 Lead caps / client slots / seats enforced server-side | ✅ (leads, clients) / 🟡 (seats) | Lead + client caps enforced & tested; seats modelled in config, no operative seats UI. |
| 2.2 Hitting a cap surfaces upgrade; own-client never capped | ✅ | `lead_cap_reached` / `client_cap_reached` errors; byoc bypasses. Tested. |
| 2.2 AI gated by tier | ✅ | Copilot gated to Growth/Fleet; `test/gdpr-theming.test.ts`. |
| 2.3 Storefront renders from tokens, no per-account code | ✅ | `theme_tokens` rows + `getTheme`; the storefront page now **renders** provider theme tokens (FW29) — see the seeded custom theme on `gleamworks-detailing`. |
| 2.3 A provider themes only their own storefront | ✅ | `publishTheme` ownership check. Tested. |
| 2.3 Low-contrast theme cannot publish (AA) | ✅ | WCAG contrast gate in `theming.ts`. Tested. |
| 2.3 AI theming metered | ⬜ | AI brand studio not built. |
| 2.4 Every AI recommendation carries its reason | ✅ | `reason` on each suggestion. Tested. |
| 2.4 Disable AI → booking/payment/etc still work | ✅ | AI is an isolated read-only module; sandbox fallback when no LLM key. |
| 2.4 Per-tier AI usage metered | 🟡 | Tier gating built; token-budget metering not. |
| 2.5 Two buckets: transactional (always) + marketing (opt-in) | ✅ | `notifications.ts`. |
| 2.5 Rebook nudges double-gated | 🟡 | Consent gate built; provider-mode gate not (nudge engine pending). |
| 2.5 Inter-party calls masked | ⬜ | Masked calling not built. |
| 2.6 Loading / empty / error / offline states | ✅ | `useAsync` + `States.tsx` (skeletons, error, offline) across pages. |
| 2.6 Dropped connection never loses data / double-charges | ✅ | Idempotent payments; client surfaces offline error and retries. |
| 2.6 Bad input handled with a clear message | ✅ | zod validation → typed API errors surfaced in the UI. |

## Sections 3–6

| Item | Status | Notes |
|---|---|---|
| 3 Synthetic data & load testing | ✅ | `npm run stress` boots the real backend and load-tests at 10k–50k users on SQLite **and Postgres**; logic + 8-point integrity scan pass. It caught & we fixed a real payment-idempotency race that only surfaced under Postgres concurrency. See `STRESS-TEST.md`. |
| 4 Sandbox payment & KYC (test mode only) | ✅ | Sandbox adapters model the no-custody flow + KYC state machine; verified-gating tested. Real Stripe **test** keys are swap-ready. |
| 5 Invariant register I1–I38 | 🟡 | The buildable invariants are implemented & tested (see table above); human-owned ones await sign-off. |
| 6 Final pre-launch sign-off | ⬜🔒 | Requires the human gates above + legal + a gated one-borough launch. |

---

## Where it deliberately stops (needs humans / real vendor accounts)
Real TLS/at-rest encryption (deployment), real Stripe Connect onboarding + payouts, real KYC document
capture (Stripe Identity/Onfido), real SMS/email OTP delivery, the legal documents, bias monitoring,
masked calling, and a real LLM for the copilot. Each has a sandbox adapter or stub today and a clear
seam to drop the real (test-mode first) integration into.
