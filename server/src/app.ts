import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { z } from "zod";
import type { Db } from "./database.js";
import { ApiError, config } from "./lib.js";
import {
  attachUser,
  claimAccount,
  clearSessionCookie,
  destroySession,
  publicUser,
  readToken,
  requireAuth,
  requestOtp,
  setSessionCookie,
  verifyOtp,
} from "./auth.js";
import { listProviders, getProviderBySlug, orgForOwner } from "./providers.js";
import { availability, cancelBooking, createBooking, getBooking, listCustomerBookings } from "./bookings.js";
import { authorizeBookingPayment, captureBookingPayment, refundBookingPayment, makeProvider } from "./payments.js";
import { cancelSubscription, getSubscription, makeBilling, setSubscription, TIER_CATALOG } from "./billing.js";
import { entitlements, type Tier } from "./entitlements.js";
import { getVerification, runSandboxKyc, setStep, type VerStep } from "./verification.js";
import { providerCopilot } from "./ai.js";
import { makeVoice, receptionist } from "./voice.js";
import { publishTheme } from "./theming.js";
import { exportUser, deleteUser } from "./gdpr.js";
import { listNotifications, makeChannels, runRebookNudges } from "./notifications.js";
import { customerConcierge } from "./concierge.js";
import { submitKycDocument } from "./verification.js";
import {
  createMembership,
  createPackage,
  issueGiftCard,
  joinMembership,
  myPackages,
  purchasePackage,
  redeemGiftCard,
  walletBalance,
} from "./commerce.js";
import { rateLimit, securityHeaders, verifyTotp } from "./security.js";
import { decryptField } from "./crypto.js";
import { applyReferral, createB2bEnquiry, myReferral, seasonalCampaign } from "./growth.js";
import { issueApiKey, requireApiKey, validateApiKey } from "./publicapi.js";
import { providerShareCard } from "./share.js";
import { VERTICALS } from "./verticals.js";
import { lookupVehicle } from "./dvsa.js";
import type { User } from "./auth.js";

const h =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

function body<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid input");
  return parsed.data;
}

async function requireOrg(req: Request) {
  const org = await orgForOwner(req.db, req.user!.id);
  if (!org) throw new ApiError(403, "not_a_provider", "You don't have a provider account");
  return org;
}

export function createApp(db: Db) {
  const app = express();
  const payments = makeProvider();
  const billing = makeBilling();
  const voice = makeVoice();
  const channels = makeChannels();

  app.set("trust proxy", true);
  app.use(securityHeaders);
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });
  app.use(attachUser);

  // FW34 rate limiting: strict on auth, generous elsewhere. Disabled only for
  // single-IP load testing (RATE_LIMIT_DISABLED=1); production keeps the limits.
  const noop = (_req: Request, _res: Response, next: NextFunction) => next();
  const authLimiter = config.rateLimitDisabled ? noop : rateLimit({ max: 10, windowMs: 60_000, bucket: "auth" });
  if (!config.rateLimitDisabled) app.use("/api", rateLimit({ max: 300, windowMs: 60_000, bucket: "api" }));

  // admin 2FA gate (TOTP) — admin routes require is_admin AND a valid x-admin-2fa code
  function require2fa(req: Request, _res: Response, next: NextFunction): void {
    const u = req.user as User | null;
    if (!u?.is_admin) throw new ApiError(403, "forbidden", "Admin only");
    const code = (req.headers["x-admin-2fa"] as string) ?? "";
    const secret = decryptField(u.admin_totp_secret); // encrypted at rest
    if (!secret || !verifyTotp(secret, code)) {
      throw new ApiError(401, "twofa_required", "Valid admin 2FA code required");
    }
    next();
  }

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, db: db.dialect, paymentMode: payments.mode, voiceMode: voice.mode }),
  );
  // readiness probe — verifies the DB is reachable (for load balancers / k8s)
  app.get(
    "/api/ready",
    h(async (_req, res) => {
      await db.get(`SELECT 1 AS ok`);
      res.json({ ready: true });
    }),
  );

  // --- auth ---
  app.post(
    "/api/auth/request-otp",
    authLimiter,
    h(async (req, res) => {
      const { identifier } = body(z.object({ identifier: z.string().min(3) }), req);
      res.json(await requestOtp(db, identifier));
    }),
  );
  app.post(
    "/api/auth/verify-otp",
    authLimiter,
    h(async (req, res) => {
      const { identifier, code } = body(z.object({ identifier: z.string().min(3), code: z.string().length(6) }), req);
      const { token, user } = await verifyOtp(db, identifier, code);
      setSessionCookie(res, token); // web
      res.json({ user: publicUser(user), token }); // token also returned for native (Capacitor) bearer auth
    }),
  );
  app.post(
    "/api/auth/logout",
    h(async (req, res) => {
      await destroySession(db, readToken(req));
      clearSessionCookie(res);
      res.json({ ok: true });
    }),
  );
  app.get("/api/auth/me", h(async (req, res) => res.json({ user: req.user ? publicUser(req.user) : null })));

  // --- account / GDPR ---
  app.patch(
    "/api/account",
    requireAuth,
    h(async (req, res) => {
      const patch = body(
        z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          marketing_consent: z.boolean().optional(),
        }),
        req,
      );
      res.json({ user: publicUser(await claimAccount(db, req.user!, patch)) });
    }),
  );
  app.get("/api/account/export", requireAuth, h(async (req, res) => res.json(await exportUser(db, req.user!.id))));
  app.delete(
    "/api/account",
    requireAuth,
    h(async (req, res) => {
      const result = await deleteUser(db, req.user!.id);
      clearSessionCookie(res);
      res.json(result);
    }),
  );

  // --- public catalog ---
  app.get(
    "/api/providers",
    h(async (req, res) => {
      res.json(
        await listProviders(db, {
          q: req.query.q as string | undefined,
          category: req.query.category as string | undefined,
          verifiedOnly: req.query.verifiedOnly === "true",
          sort: req.query.sort as string | undefined,
        }),
      );
    }),
  );
  app.get("/api/providers/:slug", h(async (req, res) => res.json(await getProviderBySlug(db, req.params.slug))));
  app.get(
    "/api/providers/:slug/availability",
    h(async (req, res) => {
      const org = await getProviderBySlug(db, req.params.slug);
      res.json(await availability(db, org.id, (req.query.date as string) ?? ""));
    }),
  );

  // --- bookings (customer) ---
  app.post(
    "/api/bookings",
    requireAuth,
    h(async (req, res) => {
      const input = body(
        z.object({
          providerSlug: z.string(),
          serviceIds: z.array(z.string()).min(1),
          date: z.string(),
          time: z.string(),
          vehicleReg: z.string().optional(),
          vehicleDesc: z.string().optional(),
        }),
        req,
      );
      const org = await getProviderBySlug(db, input.providerSlug);
      const booking = await createBooking(
        db,
        req.user!.id,
        {
          orgId: org.id,
          serviceIds: input.serviceIds,
          date: input.date,
          time: input.time,
          source: "marketplace_lead",
          vehicleReg: input.vehicleReg,
          vehicleDesc: input.vehicleDesc,
        },
        channels,
      );
      res.status(201).json(booking);
    }),
  );
  app.get("/api/bookings", requireAuth, h(async (req, res) => res.json(await listCustomerBookings(db, req.user!.id))));
  app.get("/api/bookings/:id", requireAuth, h(async (req, res) => res.json(await getBooking(db, req.user!.id, req.params.id))));
  app.post(
    "/api/bookings/:id/cancel",
    requireAuth,
    h(async (req, res) => res.json(await cancelBooking(db, req.user!.id, req.params.id))),
  );
  app.post(
    "/api/bookings/:id/pay",
    requireAuth,
    h(async (req, res) => {
      const { idempotencyKey, payoutSpeed } = body(
        z.object({ idempotencyKey: z.string().optional(), payoutSpeed: z.enum(["standard", "instant"]).optional() }),
        req,
      );
      res.json(
        await authorizeBookingPayment(db, payments, req.user!.id, req.params.id, idempotencyKey, payoutSpeed ?? "standard"),
      );
    }),
  );

  // --- notifications ---
  app.get("/api/notifications", requireAuth, h(async (req, res) => res.json(await listNotifications(db, req.user!.id))));

  // --- FW31 customer concierge ---
  app.post(
    "/api/concierge",
    requireAuth,
    h(async (req, res) => {
      const { message } = body(z.object({ message: z.string().min(1).max(500) }), req);
      res.json(await customerConcierge(db, req.user!.id, message));
    }),
  );

  // --- provider control plane ---
  app.get(
    "/api/provider/me",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      res.json({
        org: { id: org.id, name: org.name, slug: org.slug, tier: org.tier, verified: !!org.verified, rebookNudges: !!org.rebook_nudges },
        entitlements: await entitlements(db, org.id, org.tier as Tier),
        verification: await getVerification(db, org.id),
      });
    }),
  );
  app.post(
    "/api/provider/verify/kyc",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const { outcome } = body(z.object({ outcome: z.enum(["passed", "failed"]).optional() }), req);
      const verified = await runSandboxKyc(db, org.id, outcome ?? "passed");
      res.json({ verified, verification: await getVerification(db, org.id) });
    }),
  );
  app.post(
    "/api/provider/verify/step",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const { step, value } = body(
        z.object({ step: z.enum(["asset_check", "hmrc_details", "payout_setup", "twofa"]), value: z.boolean() }),
        req,
      );
      const verified = await setStep(db, org.id, step as VerStep, value);
      res.json({ verified, verification: await getVerification(db, org.id) });
    }),
  );
  app.get(
    "/api/provider/bookings",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const rows = await db.all(
        `SELECT b.id, b.ref, b.source, b.date, b.time, b.total, b.status, b.pay_method AS "payMethod", b.vehicle_reg AS "vehicleReg", b.vehicle_desc AS "vehicleDesc"
         FROM bookings b WHERE b.org_id = ? ORDER BY b.created_at DESC`,
        [org.id],
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/provider/clients/book",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const input = body(
        z.object({
          phone: z.string().min(7),
          name: z.string().optional(),
          serviceIds: z.array(z.string()).min(1),
          date: z.string(),
          time: z.string(),
        }),
        req,
      );
      const phone = input.phone.trim();
      let client = await db.get<{ id: string }>(`SELECT id FROM users WHERE phone = ?`, [phone]);
      if (!client) {
        const uid = `usr_${Math.random().toString(16).slice(2, 14)}`;
        await db.run(`INSERT INTO users (id, name, phone, claimed, created_at) VALUES (?, ?, ?, 0, ?)`, [
          uid,
          input.name ?? "",
          phone,
          Date.now(),
        ]);
        client = { id: uid };
      }
      const booking = await createBooking(db, client.id, {
        orgId: org.id,
        serviceIds: input.serviceIds,
        date: input.date,
        time: input.time,
        source: "byoc_client",
      });
      res.status(201).json(booking);
    }),
  );
  // FW33 provider settings (rebook-nudge opt-in = gate A) + run nudges
  app.patch(
    "/api/provider/settings",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const { rebookNudges } = body(z.object({ rebookNudges: z.boolean() }), req);
      await db.run(`UPDATE orgs SET rebook_nudges = ? WHERE id = ?`, [rebookNudges ? 1 : 0, org.id]);
      res.json({ ok: true, rebookNudges });
    }),
  );
  app.post(
    "/api/provider/nudges/run",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      res.json(await runRebookNudges(db, channels, org.id));
    }),
  );

  // FW27 subscription billing
  app.get(
    "/api/provider/subscription",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      res.json({ subscription: await getSubscription(db, org.id), catalog: TIER_CATALOG, current: org.tier });
    }),
  );
  app.post(
    "/api/provider/subscription",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const { tier } = body(z.object({ tier: z.enum(["solo", "growth", "fleet"]) }), req);
      res.json({ subscription: await setSubscription(db, billing, org.id, tier) });
    }),
  );
  app.post(
    "/api/provider/subscription/cancel",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      res.json({ subscription: await cancelSubscription(db, billing, org.id) });
    }),
  );
  app.post(
    "/api/provider/payments/:id/refund",
    requireAuth,
    h(async (req, res) => {
      await requireOrg(req);
      const { idempotencyKey } = body(z.object({ idempotencyKey: z.string().optional() }), req);
      res.json(await refundBookingPayment(db, payments, req.user!.id, req.params.id, idempotencyKey));
    }),
  );

  app.post(
    "/api/provider/payments/:id/capture",
    requireAuth,
    h(async (req, res) => {
      await requireOrg(req);
      const { idempotencyKey } = body(z.object({ idempotencyKey: z.string().optional() }), req);
      res.json(await captureBookingPayment(db, payments, req.user!.id, req.params.id, idempotencyKey));
    }),
  );
  app.get(
    "/api/provider/copilot",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const ent = await entitlements(db, org.id, org.tier as Tier);
      if (!ent.ai.providerSuite) throw new ApiError(403, "tier_gated", "The copilot is available on Growth and Fleet");
      res.json(await providerCopilot(db, org.id, org.tier as Tier));
    }),
  );
  // FW32 Voice AI receptionist (Fleet-gated; grounded; suggest-never-act; never moves money)
  app.post(
    "/api/provider/voice/receptionist",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const ent = await entitlements(db, org.id, org.tier as Tier);
      if (!ent.ai.voice) throw new ApiError(403, "tier_gated", "Voice AI is available on the Fleet plan");
      const { message } = body(z.object({ message: z.string().min(1).max(500) }), req);
      res.json(await receptionist(db, voice, org.id, message));
    }),
  );

  app.post(
    "/api/provider/theme",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const { tokens } = body(z.object({ tokens: z.record(z.string()) }), req);
      res.json(await publishTheme(db, req.user!.id, org.id, tokens));
    }),
  );

  // --- FW30 KYC document upload (sandbox) ---
  app.post(
    "/api/provider/verify/kyc/document",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const { docType } = body(
        z.object({ docType: z.enum(["id_front", "id_back", "proof_address", "insurance"]) }),
        req,
      );
      res.json(await submitKycDocument(db, org.id, docType));
    }),
  );

  // --- FW30 commerce: provider-side management ---
  app.post(
    "/api/provider/packages",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const input = body(
        z.object({ name: z.string().min(1), description: z.string().optional(), price: z.number().positive(), credits: z.number().int().positive() }),
        req,
      );
      res.status(201).json(await createPackage(db, org.id, input));
    }),
  );
  app.post(
    "/api/provider/memberships",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const input = body(z.object({ name: z.string().min(1), description: z.string().optional(), monthlyPrice: z.number().positive() }), req);
      res.status(201).json(await createMembership(db, org.id, input));
    }),
  );

  // --- FW30 commerce: customer-side ---
  app.post("/api/packages/:id/purchase", requireAuth, h(async (req, res) => res.status(201).json(await purchasePackage(db, req.user!.id, req.params.id))));
  app.get("/api/me/packages", requireAuth, h(async (req, res) => res.json(await myPackages(db, req.user!.id))));
  app.post("/api/memberships/:id/join", requireAuth, h(async (req, res) => res.status(201).json(await joinMembership(db, req.user!.id, req.params.id))));
  app.get("/api/account/wallet", requireAuth, h(async (req, res) => res.json({ balance: await walletBalance(db, req.user!.id) })));
  app.post(
    "/api/giftcards",
    requireAuth,
    h(async (req, res) => {
      const { amount } = body(z.object({ amount: z.number().positive() }), req);
      res.status(201).json(await issueGiftCard(db, req.user!.id, amount));
    }),
  );
  app.post(
    "/api/giftcards/redeem",
    requireAuth,
    h(async (req, res) => {
      const { code } = body(z.object({ code: z.string().min(6) }), req);
      res.json(await redeemGiftCard(db, req.user!.id, code));
    }),
  );

  // --- Wave 5: referrals ---
  app.get("/api/account/referral", requireAuth, h(async (req, res) => res.json(await myReferral(db, req.user!.id))));
  app.post(
    "/api/referrals/apply",
    requireAuth,
    h(async (req, res) => {
      const { code } = body(z.object({ code: z.string().min(4) }), req);
      res.json(await applyReferral(db, req.user!.id, code));
    }),
  );

  // --- Wave 5: seasonal engine (public) ---
  app.get(
    "/api/seasonal",
    h(async (_req, res) => {
      const c = seasonalCampaign();
      const featured = await listProviders(db, { category: c.pushCategories[0], sort: "rating" });
      res.json({ campaign: c, featured: featured.slice(0, 4) });
    }),
  );

  // --- Wave 5: B2B / fleet enquiry (public) ---
  app.post(
    "/api/b2b/enquiry",
    h(async (req, res) => {
      const input = body(
        z.object({ name: z.string().min(1), email: z.string().email(), company: z.string().optional(), fleetSize: z.number().int().optional(), message: z.string().optional() }),
        req,
      );
      res.status(201).json(await createB2bEnquiry(db, input));
    }),
  );

  // --- Wave 5: branded share card (public, SVG) ---
  app.get(
    "/api/providers/:slug/share-card.svg",
    h(async (req, res) => {
      const svg = await providerShareCard(db, req.params.slug);
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(svg);
    }),
  );

  // --- Wave 5: verticals (vertical-agnostic core) ---
  app.get("/api/verticals", h(async (_req, res) => res.json(Object.values(VERTICALS))));

  // --- DVSA MOT/vehicle lookup (auth required to curb abuse) ---
  app.get(
    "/api/vehicles/:reg",
    requireAuth,
    h(async (req, res) => res.json(await lookupVehicle(req.params.reg))),
  );

  // --- Wave 5: provider issues a public API key ---
  app.post(
    "/api/provider/api-keys",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      const { label } = body(z.object({ label: z.string().optional() }), req);
      res.status(201).json(await issueApiKey(db, org.id, label ?? "default"));
    }),
  );

  // --- Wave 5: public partner API (key-authenticated, read-only) ---
  app.get(
    "/api/v1/providers",
    requireApiKey,
    h(async (req, res) => {
      const ok = await validateApiKey(db, (req as Request & { apiKeyHash?: string }).apiKeyHash);
      if (!ok) throw new ApiError(401, "unauthorized", "Invalid API key");
      res.json(await listProviders(db, { q: req.query.q as string | undefined, sort: req.query.sort as string | undefined }));
    }),
  );

  // --- FW34 admin god-view (cross-tenant; requireAuth + admin + 2FA, fully audited) ---
  app.get(
    "/api/admin/overview",
    requireAuth,
    require2fa,
    h(async (_req, res) => {
      const count = async (tbl: string) => Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tbl}`))!.n);
      res.json({
        users: await count("users"),
        orgs: await count("orgs"),
        bookings: await count("bookings"),
        payments: await count("payments"),
        giftCards: await count("gift_cards"),
      });
    }),
  );
  app.get(
    "/api/admin/orgs",
    requireAuth,
    require2fa,
    h(async (_req, res) => {
      res.json(await db.all(`SELECT id, name, slug, tier, verified FROM orgs ORDER BY created_at DESC LIMIT 100`));
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
    } else {
      console.error(err);
      res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
    }
  });

  return app;
}
