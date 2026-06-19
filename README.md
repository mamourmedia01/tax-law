# Fable+ — Mobile car-care booking app

A Fresha-inspired booking app for the UK mobile car-care market, built on the **Fable+** brand
(teal / off-white / near-black, Sora + Inter). Customers discover trusted local valets and
detailers, browse services, and book in a few taps — with **no platform fees** and payment made
directly to the provider.

This is the consumer-facing booking experience from the Fable+ master build pack. It implements
the UI/UX Design Brief (PART 9) as a working React app.

## Features

- **Home** — branded discovery: search, the signature teal-gradient hero, service categories,
  recommended & top-rated providers, and your next booking at a glance.
- **Search** — live text search with category filters, sort (top rated / price / nearest) and a
  "verified only" toggle.
- **Provider storefront** — hero, ratings, about, a full service menu, reviews, and **The Reveal**
  (a draggable before/after slider — the brand's signature element).
- **Booking flow** — a 4-step flow (services → date & time → your details → review) with
  **guest checkout** (no forced signup; an account is auto-created and claimable) and a
  "Gleaming. Booking confirmed." celebration.
- **Bookings** — upcoming / past tabs, status badges, cancel and rebook.
- **Profile** — editable details, a teal-gradient wallet/credit card, saved providers, and the
  "list your business" entry point.
- **Design system** — Fable+ tokens (colours, type, radii, shadows, motion) encoded in Tailwind;
  WCAG-minded contrast, focus rings, 48px+ touch targets and a reduced-motion fallback.

## Now full-stack & sandboxed

This is no longer a mock front-end — it runs on a **real backend** (`/server`) with server-enforced
logic for the platform's invariants, plus **sandbox adapters** for external services (Stripe, SMS/OTP,
KYC, LLM) that are swap-ready for *test-mode* keys. No live rails are touched. See
[`BUILD-AUDIT.md`](./BUILD-AUDIT.md) for the PART 10 checklist status and `server/test` for the
18 invariant tests that back it.

What's real now: OTP auth + guest→claimed accounts, tenant isolation (deny-by-default), the booking
engine (source-tagging, double-booking prevention, server-side lead/client caps), a **no-custody**
payment state machine (zero platform fee, idempotent, verified-gated), the verification state machine
(badge only when fully earned), storefront theming tokens (AA-gated), two-bucket notification consent,
GDPR export/erasure, an immutable audit log, and a **grounded** provider copilot (suggest-never-act).

## Tech

**Web:** React 18 · TypeScript · Vite · Tailwind CSS · React Router · lucide-react.
**API:** Node · Express · better-sqlite3 · Zod · Vitest. Sandbox Stripe/OTP/KYC/LLM adapters.

## Run

```bash
# 1. backend (terminal 1)
cd server && npm install && npm run dev      # http://localhost:8787 (auto-seeds the catalog)

# 2. web app (terminal 2)
npm install && npm run dev                    # http://localhost:5173 (proxies /api → :8787)
```

Sign-in uses a one-time code; in sandbox the code is shown on screen. Provider dashboard: sign in
on the Profile tab with e.g. `jamies-mobile-valet@provider.fableplus`.

```bash
npm run build           # web type-check + production build
cd server && npm test   # 18 invariant tests (isolation, caps, payments, GDPR, theming, AI)
```

## Scope & notes

The consumer marketplace and the core provider control plane are built and tested in sandbox.
Items that need real vendor accounts or qualified humans before go-live — real Stripe Connect
onboarding/payouts, real KYC document capture, SMS/email OTP delivery, TLS/at-rest encryption, the
legal documents, bias monitoring and masked calling — each have a sandbox adapter today and a clear
seam for the real (test-mode-first) integration. `BUILD-AUDIT.md` tracks exactly what's done vs.
pending human sign-off.
