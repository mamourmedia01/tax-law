# Fable+ — Build Waves

Tracking the build-out of the remaining spec features (FW27–FW34 + cross-cutting). Each wave is
built, tested, and committed before the next. Final step: re-run the 50k stress test on the full
platform.

| Wave | Scope | Status |
|---|---|---|
| **1** | FW32 Voice AI/VibeVoice · FW29 storefront theming render · in-app content/legal pages | ✅ done |
| **2** | FW27 subscription billing · FW28 refunds + instant/standard payout · PWA (installable) | ✅ done |
| **3** | FW33 notification delivery (email/SMS/push adapters + nudge engine) · FW31 customer concierge | ✅ done |
| **4** | FW30 KYC doc upload + packages/memberships/gift cards · FW34 hardening (rate limiting, headers, admin god-view + TOTP 2FA) | ✅ done |
| **5** | referrals · seasonal engine · B2B portal · public API · map view · share cards · vertical-agnostic refactor | ✅ done |
| **6** | full-platform **50k stress test** re-run on Postgres + fix anything it surfaces | ✅ done |
| **7** | Capacitor native shell (iOS + Android) from the same codebase | ✅ done |
| **8** | DVSA MOT History API — vehicle/MOT lookup (live OAuth2 + sandbox fallback) | ✅ done |
| **9** | Android APK build · DVSA reg in booking flow · deployment config (Docker/TLS/encryption-at-rest) | ✅ done |
| **10** | QR codes · brand assets · regulations page · iOS scaffold + CI (Android+iOS) | ✅ done |
| **11** | Spec gap audit (GAPS-TODO.md) · Batch 1 (lifecycle/reviews/garage/wallet/fully-booked) · Batch 2 (referral attribution/recurring/team/HMRC) | ✅ done |
| **12** | Expo Go shell (navigate the platform from Expo Go via WebView) | ✅ done |
| **13** | Production-readiness pass (confidence list #2–#14 + cheapest-risk-retirement): security/IDOR authz suite · real DB migration system · cookie/CORS hardening · real Stripe payments+billing adapters · real Anthropic LLM behind concierge/copilot/voice · faithful VibeVoice API · DVSA schema hardening · **50k Postgres stress re-confirmed (11/11 integrity)** · per-section colour coordination | ✅ done |

External integrations remain sandbox/swap-ready (real Stripe/KYC/SMS/LLM/VibeVoice keys drop in
later). Section 1 of the PART 10 checklist (human sign-offs: legal, pen-test, encryption-at-rest)
is deliberately left for last.

## Wave 2 detail (done)
- **FW27** `subscriptions` table + sandbox billing adapter (`server/src/billing.ts`); subscribe /
  change-plan / cancel routes; plan changes drive entitlements live; **Plan & billing** UI in the
  dashboard. Tests: `server/test/billing.test.ts`.
- **FW28** payout speed (`standard`/`instant`) recorded on authorize; owner-gated, idempotent
  **refund** route. Tests in `billing.test.ts`.
- **PWA** `vite-plugin-pwa` — web manifest, service worker (network-first catalog cache, API never
  cached), maskable icons. Installable to a phone home screen; works offline for cached views.
