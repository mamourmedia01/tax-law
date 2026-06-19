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

State (bookings, profile, saved providers) persists in `localStorage`. All imagery is rendered
offline via deterministic brand-gradient tiles, so the app runs with no network dependency.

## Tech

React 18 · TypeScript · Vite · Tailwind CSS · React Router · lucide-react icons.

## Run

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build
npm run preview  # preview the production build
```

## Scope & notes

This is the **consumer marketplace MVP**. The wider platform described in the master build
document — provider control plane (FW27), Stripe no-custody payments (FW28), storefront theming
engine (FW29), verification/KYC (FW30), the AI layer (FW31–33) and security/data-isolation
(FW34) — is intentionally out of scope here and flagged for the human-review work the build pack
requires before launch. Mock data stands in for a backend.
