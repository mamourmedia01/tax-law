# Fable Plus — Regulations & Compliance Reference

**The UK regulatory landscape for the platform · What applies, and what we do about it · A reference, not legal advice**

> **Important:** this document is a structured reference for the build and operations teams. It is **not legal advice**. Before launch, every item here — and the Terms of Service and Privacy Policy — must be reviewed and signed off by a **qualified UK solicitor / data-protection specialist**. Regulations change; verify current requirements.

---

## 0. Why this matters

Fable Plus moves money, verifies identities, handles personal data, and connects consumers with independent businesses. That puts it inside several UK regulatory regimes at once. The design principle throughout the specs has been to **build the data model and controls to satisfy the strictest reading**, so compliance is a configuration and a filter rather than a rebuild. This reference maps each regime to what we do.

---

## 1. HMRC — digital platform reporting (the big one)

The UK's rules for digital platforms (the OECD model / "DAC7-equivalent") make Fable Plus a **Reporting Platform Operator**.
- **Obligation:** collect, verify, and annually report seller (provider) information — legal name, address, date of birth or company number, tax identifier (NI number / UTR), bank reference — plus income and transaction counts, for **reportable sellers**.
- **Reportable threshold:** the low de-minimis exemption (broadly fewer than ~30 transactions *and* under ~£1,700/year per seller) — so any active earning provider is in scope.
- **Deadline:** annual report by **31 January** following the reportable year; each provider auto-receives their own copy (doubling as a Self-Assessment aid).
- **What we do:** collect these details at provider verification (FW30); **verification gates marketplace and in-app payments** precisely so reportable activity always carries the required data. Cash-only unverified providers (no money through the platform) sit in the cash-BYOC area flagged for counsel, but are captured in the same data model so reportability is a filter.

## 2. VAT

- Providers may or may not be VAT-registered; the platform stores a **VAT-registered flag + number**.
- Invoices render VAT lines **only** for registered providers; a threshold-approach nudge helps providers nearing the registration limit (Volume 1.2 §5.2).
- The platform's own subscription revenue is VAT-accounted per its own registration.
- **Review needed:** the VAT treatment of the platform's role (agent vs principal) — confirm with an accountant; our model is provider-as-principal, platform-as-tool.

## 3. UK GDPR & PECR (data protection)

- **Lawful basis** for each processing purpose; **consent** for marketing (PECR), biometric processing (explicit), and cross-provider AI learning (FW32).
- **Data Processing Agreement** accepted at provider (BYOC) signup; controller/processor roles documented.
- **Rights:** access, portability, rectification, and **erasure (RTBF)** — with a deletion workflow spanning every store (database, media, analytics warehouse, biometric embeddings) (Compliance & Audit spec; FW34).
- **PECR / marketing:** marketing consent is **separate from transactional and freely withdrawable**; one-tap unsubscribe on every marketing message (FW33 two-bucket model).
- **Data minimisation, retention schedule, breach notification (72 hours)** — all defined (FW34, Compliance & Audit spec).
- **DPO / contact** named in the Privacy Policy.

## 4. Payments — FCA / PSR

- The platform **never custodies funds**: Stripe Connect Express moves money provider-to-payout; the platform is not in the flow (FW28). This is deliberate — holding customer money would pull the platform into **payment-services / e-money regulation (FCA/PSR)**.
- The credit wallet holds **promotional credit only**, never provider money (FW28 §8).
- **Review needed:** confirm with counsel that the no-custody architecture keeps the platform outside FCA authorisation requirements (our strong design intent; verify).

## 5. Consumer protection

- **Consumer Rights Act 2015** — services performed with reasonable care and skill; the **Guarantee** and dispute process sit on top of, not instead of, statutory rights.
- **Consumer Contracts Regulations** — clear pre-contract information (price, service, cancellation), confirmation, and cancellation rights; the booking flow surfaces price, service, duration, and the provider's cancellation policy before payment (screenshots/FW specs).
- **Transparent pricing** — no hidden platform fee to consumers (there is none); "from £X" and totals shown up front.

## 6. Employment status (worker classification)

- Providers and operatives are **independent businesses / self-employed**, not platform employees — the platform is a tool and marketplace, not their employer.
- **Review needed (important):** UK worker-status case law (the gig-economy line) is live and fact-sensitive; how much control the platform exerts affects classification. The model (providers set their own prices, hours, and clients; the platform doesn't direct the work) supports independence — but this **must** be reviewed by an employment-law specialist, as misclassification is a significant risk.
- Payroll tooling for Fleet **reports, does not employ** — it helps a provider pay *their* operatives; the platform is not the employer (FW27).

## 7. Insurance & liability

- Providers are responsible for their own insurance (public liability, motor trade); the platform stores **insurance status** as a trust signal and may require it for verification/marketplace.
- The **Guarantee** is a service-quality promise with defined limits (re-clean/credit), distinct from **damage liability** (routed to the provider's insurance/dispute path) — the two must not be conflated (FW30/Volume 1.0).
- Liability limits and disclaimers set in the Terms of Service.

## 8. Advertising & marketing standards

- **ASA / CAP Code** — marketing claims (including AI-generated storefront copy and campaigns) must be truthful and substantiated; the AI governance bias/accuracy checks (FW32) and human approval (FW33) support this.
- Reviews must be genuine (verified-booking-gated); fake-review and incentivised-review rules respected (CMA guidance).

## 9. Accessibility & equality

- **WCAG 2.x AA** across web/app flows (Build Brief DoD; PWA spec); storefront themes contrast-enforced to AA (FW29).
- **Equality Act 2010** — no discrimination; the AI **bias monitoring** on pricing/recommendations (FW32) guards against indirect discrimination by area or proxy.

## 10. Age & safeguarding

- Service is for adults (18+) transacting; age-gating where relevant.
- Operative identity verification (KYC) supports a safe marketplace; safeguarding/abuse reporting routes to human review (Support Operations).

## 11. Security certification

- **Cyber Essentials**, then **Plus** — obtained and maintained; a procurement unlock for B2B/fleet (Volume 1.2 §5.4) and a baseline assurance for data protection (FW34).

## 12. The compliance calendar (owners & dates)

| Obligation | Cadence | Owner |
|---|---|---|
| HMRC seller report | Annual, by 31 Jan | Finance/Compliance |
| HMRC due-diligence re-verification | Per guidance | Ops/Compliance |
| Cyber Essentials renewal | Annual | Security |
| DPA / Terms / Privacy review | On change | Legal |
| Retention-job audit | Quarterly | Eng/Compliance |
| RTBF / data-export SLA review | Ongoing | Support/Compliance |
| Access-control review | Quarterly | Security |
| VAT / accounts | Per HMRC schedule | Finance |

---

*Regulations in one line: Fable Plus sits inside HMRC platform-reporting, UK GDPR/PECR, consumer-protection, payment, employment, advertising, accessibility, and security regimes — the architecture is built to satisfy the strictest reading of each so compliance is a filter not a rebuild — and every line here must be confirmed by a qualified UK solicitor before launch, because this is a reference, not legal advice.*
