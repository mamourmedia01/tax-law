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
import { listNotifications } from "./notifications.js";

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

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });
  app.use(attachUser);

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, db: db.dialect, paymentMode: payments.mode, voiceMode: voice.mode }),
  );

  // --- auth ---
  app.post(
    "/api/auth/request-otp",
    h(async (req, res) => {
      const { identifier } = body(z.object({ identifier: z.string().min(3) }), req);
      res.json(await requestOtp(db, identifier));
    }),
  );
  app.post(
    "/api/auth/verify-otp",
    h(async (req, res) => {
      const { identifier, code } = body(z.object({ identifier: z.string().min(3), code: z.string().length(6) }), req);
      const { token, user } = await verifyOtp(db, identifier, code);
      setSessionCookie(res, token);
      res.json({ user: publicUser(user) });
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
        }),
        req,
      );
      const org = await getProviderBySlug(db, input.providerSlug);
      const booking = await createBooking(db, req.user!.id, {
        orgId: org.id,
        serviceIds: input.serviceIds,
        date: input.date,
        time: input.time,
        source: "marketplace_lead",
      });
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

  // --- provider control plane ---
  app.get(
    "/api/provider/me",
    requireAuth,
    h(async (req, res) => {
      const org = await requireOrg(req);
      res.json({
        org: { id: org.id, name: org.name, slug: org.slug, tier: org.tier, verified: !!org.verified },
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
        `SELECT b.id, b.ref, b.source, b.date, b.time, b.total, b.status, b.pay_method AS "payMethod"
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
