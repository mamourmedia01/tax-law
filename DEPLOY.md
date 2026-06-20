# Fable+ — Deployment

A containerised production stack: **Postgres + API + an nginx TLS edge** serving the PWA and
proxying the API. Addresses the PART 10 §1 deployment items (TLS, encryption-at-rest, secrets).

```
                 ┌────────────── nginx (web) ──────────────┐
 client ──443──▶ │ TLS · security headers · gzip            │
                 │  /          → static PWA (dist, SPA)     │
                 │  /api/*     → proxy ──▶ server:8787      │
                 └──────────────────────────────────────────┘
                                              │
                                       Postgres (pgdata volume)
```

## 1. Configure secrets
```bash
cp .env.production.example .env
# fill in DB_PASSWORD, SESSION_SECRET, and:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # -> ENCRYPTION_KEY
# add real test-mode keys (Stripe/DVSA/etc) or leave blank for sandbox adapters
```
The server **refuses to boot in production** unless `SESSION_SECRET`, `DATABASE_URL`, and a valid
`ENCRYPTION_KEY` are set (`assertProductionConfig`).

## 2. TLS certificates
Put `fullchain.pem` + `privkey.pem` in `./certs/`.

- **Production:** issue with Let's Encrypt / certbot (the nginx config serves
  `/.well-known/acme-challenge/` from `./certbot-www`), or terminate TLS at a managed load
  balancer (ALB / Cloud Load Balancing) and point it at the `web` service.
- **Local test:** `mkdir certs && openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/privkey.pem -out certs/fullchain.pem -days 365 -subj "/CN=localhost"`

## 3. Run
```bash
docker compose up -d --build
docker compose ps
curl -k https://localhost/api/health     # {"ok":true,...}
curl -k https://localhost/api/ready      # {"ready":true}  (DB reachable)
```
The DB auto-migrates its schema on first boot and seeds the demo catalogue.

## Encryption at rest (two layers)
1. **Infrastructure (primary):** encrypt the database volume. Managed: enable encryption on RDS /
   Cloud SQL. Self-hosted: put `pgdata` on a LUKS-encrypted volume.
2. **Application (defence-in-depth):** sensitive fields are encrypted with AES-256-GCM via
   `ENCRYPTION_KEY` (`server/src/crypto.ts`) — wired for the admin 2FA secret; extend
   `encryptField`/`decryptField` to any column (KYC refs, etc.). Tolerates plaintext so existing
   rows keep working.

## Scaling
- The `server` is stateless (sessions are token/DB-based) — run N replicas behind the proxy /
  load balancer; Postgres is the shared state. Add `pgBouncer` + read replicas as load grows
  (see `STRESS-TEST.md`).
- Move notification delivery to a queue (flagged in `STRESS-TEST.md`).

## Mobile build pointing at this API
Build the app with `VITE_API_URL=https://app.fableplus.co.uk` then `npm run cap:android` (see
`MOBILE.md`).

## Still human/vendor sign-off (PART 10 §1)
TLS cert issuance + the managed encrypted DB are infra choices you make at deploy time; a human
pen-test, the legal docs (UK solicitor), and swapping the remaining sandbox adapters for real
test-mode keys remain before real customers/money.
