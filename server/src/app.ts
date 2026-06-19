import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { z } from "zod";
import type { DB } from "./db.js";
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
import {
  availability,
  cancelBooking,
  createBooking,
  getBooking,
  listCustomerBookings,
} from "./bookings.js";
import { authorizeBookingPayment, captureBookingPayment, makeProvider } from "./payments.js";
import { entitlements, type Tier } from "./entitlements.js";
import { getVerification, runSandboxKyc, setStep, type VerStep } from "./verification.js";
import { providerCopilot } from "./ai.js";
import { publishTheme } from "./theming.js";
import { exportUser, deleteUser } from "./gdpr.js";
import { listNotifications } from "./notifications.js";

// async wrapper that funnels thrown ApiErrors into JSON responses
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

// resolve the org owned by the current user, or 403
function requireOrg(req: Request) {
  const org = orgForOwner(req.db, req.user!.id);
  if (!org) throw new ApiError(403, "not_a_provider", "You don't have a provider account");
  return org;
}

export function createApp(db: DB) {
  const app = express();
  const payments = makeProvider();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });
  app.use(attachUser);

  app.get("/api/health", (_req, res) => res.json({ ok: true, paymentMode: payments.mode }));

  // --- auth ---
  app.post(
    "/api/auth/request-otp",
    h((req, res) => {
      const { identifier } = body(z.object({ identifier: z.string().min(3) }), req);
      res.json(requestOtp(db, identifier));
    }),
  );
  app.post(
    "/api/auth/verify-otp",
    h((req, res) => {
      const { identifier, code } = body(
        z.object({ identifier: z.string().min(3), code: z.string().length(6) }),
        req,
      );
      const { token, user } = verifyOtp(db, identifier, code);
      setSessionCookie(res, token);
      res.json({ user: publicUser(user) });
    }),
  );
  app.post(
    "/api/auth/logout",
    h((req, res) => {
      destroySession(db, readToken(req));
      clearSessionCookie(res);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/auth/me",
    h((req, res) => res.json({ user: req.user ? publicUser(req.user) : null })),
  );

  // --- account / GDPR ---
  app.patch(
    "/api/account",
    requireAuth,
    h((req, res) => {
      const patch = body(
        z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          marketing_consent: z.boolean().optional(),
        }),
        req,
      );
      res.json({ user: publicUser(claimAccount(db, req.user!, patch)) });
    }),
  );
  app.get(
    "/api/account/export",
    requireAuth,
    h((req, res) => res.json(exportUser(db, req.user!.id))),
  );
  app.delete(
    "/api/account",
    requireAuth,
    h((req, res) => {
      const result = deleteUser(db, req.user!.id);
      clearSessionCookie(res);
      res.json(result);
    }),
  );

  // --- public catalog ---
  app.get(
    "/api/providers",
    h((req, res) => {
      res.json(
        listProviders(db, {
          q: req.query.q as string | undefined,
          category: req.query.category as string | undefined,
          verifiedOnly: req.query.verifiedOnly === "true",
          sort: req.query.sort as string | undefined,
        }),
      );
    }),
  );
  app.get(
    "/api/providers/:slug",
    h((req, res) => res.json(getProviderBySlug(db, req.params.slug))),
  );
  app.get(
    "/api/providers/:slug/availability",
    h((req, res) => {
      const slug = req.params.slug;
      const date = (req.query.date as string) ?? "";
      const org = getProviderBySlug(db, slug);
      res.json(availability(db, org.id, date));
    }),
  );

  // --- bookings (customer) ---
  app.post(
    "/api/bookings",
    requireAuth,
    h((req, res) => {
      const input = body(
        z.object({
          providerSlug: z.string(),
          serviceIds: z.array(z.string()).min(1),
          date: z.string(),
          time: z.string(),
        }),
        req,
      );
      const org = getProviderBySlug(db, input.providerSlug);
      const booking = createBooking(db, req.user!.id, {
        orgId: org.id,
        serviceIds: input.serviceIds,
        date: input.date,
        time: input.time,
        source: "marketplace_lead", // consumer marketplace booking
      });
      res.status(201).json(booking);
    }),
  );
  app.get(
    "/api/bookings",
    requireAuth,
    h((req, res) => res.json(listCustomerBookings(db, req.user!.id))),
  );
  app.get(
    "/api/bookings/:id",
    requireAuth,
    h((req, res) => res.json(getBooking(db, req.user!.id, req.params.id))),
  );
  app.post(
    "/api/bookings/:id/cancel",
    requireAuth,
    h((req, res) => res.json(cancelBooking(db, req.user!.id, req.params.id))),
  );
  app.post(
    "/api/bookings/:id/pay",
    requireAuth,
    h((req, res) => {
      const { idempotencyKey } = body(z.object({ idempotencyKey: z.string().optional() }), req);
      res.json(authorizeBookingPayment(db, payments, req.user!.id, req.params.id, idempotencyKey));
    }),
  );

  // --- notifications ---
  app.get(
    "/api/notifications",
    requireAuth,
    h((req, res) => res.json(listNotifications(db, req.user!.id))),
  );

  // --- provider control plane ---
  app.get(
    "/api/provider/me",
    requireAuth,
    h((req, res) => {
      const org = requireOrg(req);
      res.json({
        org: { id: org.id, name: org.name, slug: org.slug, tier: org.tier, verified: !!org.verified },
        entitlements: entitlements(db, org.id, org.tier as Tier),
        verification: getVerification(db, org.id),
      });
    }),
  );
  app.post(
    "/api/provider/verify/kyc",
    requireAuth,
    h((req, res) => {
      const org = requireOrg(req);
      const { outcome } = body(z.object({ outcome: z.enum(["passed", "failed"]).optional() }), req);
      const verified = runSandboxKyc(db, org.id, outcome ?? "passed");
      res.json({ verified, verification: getVerification(db, org.id) });
    }),
  );
  app.post(
    "/api/provider/verify/step",
    requireAuth,
    h((req, res) => {
      const org = requireOrg(req);
      const { step, value } = body(
        z.object({ step: z.enum(["asset_check", "hmrc_details", "payout_setup", "twofa"]), value: z.boolean() }),
        req,
      );
      const verified = setStep(db, org.id, step as VerStep, value);
      res.json({ verified, verification: getVerification(db, org.id) });
    }),
  );
  app.get(
    "/api/provider/bookings",
    requireAuth,
    h((req, res) => {
      const org = requireOrg(req);
      const rows = db
        .prepare(
          `SELECT b.id, b.ref, b.source, b.date, b.time, b.total, b.status, b.pay_method AS payMethod
           FROM bookings b WHERE b.org_id = ? ORDER BY b.created_at DESC`,
        )
        .all(org.id);
      res.json(rows);
    }),
  );
  app.post(
    "/api/provider/clients/book",
    requireAuth,
    h((req, res) => {
      const org = requireOrg(req);
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
      // find-or-create the provider's own client as a guest user
      const phone = input.phone.trim();
      let client = db.prepare(`SELECT id FROM users WHERE phone = ?`).get(phone) as { id: string } | undefined;
      if (!client) {
        const uid = `usr_${Math.random().toString(16).slice(2, 14)}`;
        db.prepare(`INSERT INTO users (id, name, phone, claimed, created_at) VALUES (?, ?, ?, 0, ?)`).run(
          uid,
          input.name ?? "",
          phone,
          Date.now(),
        );
        client = { id: uid };
      }
      const booking = createBooking(db, client.id, {
        orgId: org.id,
        serviceIds: input.serviceIds,
        date: input.date,
        time: input.time,
        source: "byoc_client", // own-client booking — never consumes a lead, unlimited
      });
      res.status(201).json(booking);
    }),
  );
  app.post(
    "/api/provider/payments/:id/capture",
    requireAuth,
    h((req, res) => {
      requireOrg(req);
      const { idempotencyKey } = body(z.object({ idempotencyKey: z.string().optional() }), req);
      res.json(captureBookingPayment(db, payments, req.user!.id, req.params.id, idempotencyKey));
    }),
  );
  app.get(
    "/api/provider/copilot",
    requireAuth,
    h((req, res) => {
      const org = requireOrg(req);
      const ent = entitlements(db, org.id, org.tier as Tier);
      if (!ent.ai.providerSuite) {
        throw new ApiError(403, "tier_gated", "The copilot is available on Growth and Fleet");
      }
      res.json(providerCopilot(db, org.id, org.tier as Tier));
    }),
  );
  app.post(
    "/api/provider/theme",
    requireAuth,
    h((req, res) => {
      const org = requireOrg(req);
      const { tokens } = body(z.object({ tokens: z.record(z.string()) }), req);
      res.json(publishTheme(db, req.user!.id, org.id, tokens));
    }),
  );

  // --- error handler ---
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
