# Fable+ — Build audit vs. the full spec pack (every uploaded file)

Went through every file in `fablepluscompletebuild.zip` + the master doc + addenda. Below is what's
**already built** vs. the **remaining buildable gaps**, in build order. (Native-only / infra / human
items are listed separately at the end.)

## Already built (waves 1–9 + QR/brand/iOS)
Booking engine (source tagging, double-booking, server-side caps), guest-checkout OTP, verification/
KYC sandbox, no-custody payments (+refunds, payout speed, idempotency), subscription billing (3 tiers),
storefront theming (+render), notifications (two-bucket + quiet hours) & double-gated rebook nudges,
customer concierge, voice receptionist (VibeVoice), commerce (packages/memberships/gift cards),
referrals (codes + credit), seasonal engine, public API, B2B enquiry, map view, share cards + **QR**,
DVSA MOT lookup (+ in booking flow), content/legal/guides/regulations, PWA, Capacitor (Android APK +
iOS scaffold + CI), Docker/TLS/encryption-at-rest deployment, admin god-view + TOTP 2FA, rate limiting.

## Remaining buildable gaps — TODO (in order)

### Batch 1 — booking completeness
- [ ] **Booking lifecycle**: provider marks a booking `completed` / `no_show` (status transitions).
- [ ] **Reviews**: customer leaves a rating+text on a *completed* booking → recompute org rating/count.
- [ ] **My Garage**: save 1..n vehicles per user (via DVSA lookup); prefill the booking flow.
- [ ] **Wallet at checkout**: apply wallet credit (gift/referral) to reduce a booking total.
- [ ] **"Fully booked"**: storefront reflects marketplace lead-cap-reached for new customers.

### Batch 2 — growth & provider ✅
- [x] **Referral attribution (ClientLink)**: booking via a provider's `?ref` → `byoc_client`
      (no marketplace lead consumed) — FW26 Addendum A §16.4.
- [x] **Recurring bookings**: weekly repeat (generates future bookings, skips taken slots).
- [x] **Team/operative seats**: invite operatives within the tier seat cap (Fleet ∞).
- [x] **HMRC seller tax fields**: collect (satisfies the verification step).

### Batch 3 — parity polish
- [ ] **Sponsored placement** (labelled, never interleaved as organic).
- [ ] **No-show deposits / cancellation window** rules.
- [ ] **Provider analytics heatmap** (FW27 §6) — booking density.
- [ ] **Provider AI**: plain-language business questions + summaries (FW31 §3.2/3.3).

## Deliberately deferred (native / infra / human — per the build brief §6/§13)
In-house biometrics, CV Tier-2/3 capture/Guarantee enforcement (operative native app + GPU),
masked calling (Twilio), deferred deep-link routing on physical devices, real TLS cert issuance +
managed encrypted DB (deploy-time), real Stripe/KYC/SMS/LLM/VibeVoice keys, legal sign-off, pen-test.
