import type { DB } from "./db.js";
import { Errors, config, id, now, sha256 } from "./lib.js";
import { audit } from "./audit.js";

// ---------------------------------------------------------------------------
// Payment provider abstraction.
//
// In SANDBOX mode (no STRIPE_SECRET_KEY) we use an in-process adapter that
// faithfully models Stripe's destination-charge + Connect payout lifecycle:
//   - funds are charged with a `transfer_data.destination` = the provider's
//     connected account, so the PLATFORM NEVER HOLDS THE MONEY (audit I12),
//   - application_fee is always 0 (no commission — locked decision / I3),
//   - operations are idempotent by idempotency key (audit I14, no double-charge).
//
// Dropping a real Stripe TEST key in .env is where the live (test-mode) adapter
// would be wired — the interface below is exactly Stripe-shaped.
// ---------------------------------------------------------------------------

export type IntentStatus = "requires_capture" | "captured" | "paid_out" | "refunded" | "failed";

export interface Intent {
  id: string;
  amount: number;
  applicationFee: number;
  destination: string;
  status: IntentStatus;
}

export interface PaymentProvider {
  readonly mode: "sandbox" | "stripe_test";
  createIntent(args: {
    amount: number;
    destination: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Intent;
  capture(intentId: string, idempotencyKey: string): Intent;
  refund(intentId: string, idempotencyKey: string): Intent;
}

class SandboxStripe implements PaymentProvider {
  readonly mode = "sandbox" as const;
  private intents = new Map<string, Intent>();
  private byIdem = new Map<string, string>(); // idempotencyKey -> intentId

  createIntent(args: {
    amount: number;
    destination: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Intent {
    const existing = this.byIdem.get(`create:${args.idempotencyKey}`);
    if (existing) return this.intents.get(existing)!;
    if (args.amount <= 0) throw Errors.payment("Amount must be positive");
    if (!args.destination) throw Errors.payment("Missing destination account");
    // platform takes nothing; funds are destined for the provider's connected account
    const intent: Intent = {
      id: `pi_sand_${sha256(args.idempotencyKey).slice(0, 20)}`,
      amount: args.amount,
      applicationFee: 0,
      destination: args.destination,
      status: "requires_capture",
    };
    this.intents.set(intent.id, intent);
    this.byIdem.set(`create:${args.idempotencyKey}`, intent.id);
    return intent;
  }

  capture(intentId: string, idempotencyKey: string): Intent {
    const intent = this.intents.get(intentId);
    if (!intent) throw Errors.payment("Unknown payment intent");
    const seen = this.byIdem.get(`capture:${idempotencyKey}`);
    if (seen) return this.intents.get(seen)!;
    if (intent.status === "requires_capture") {
      // destination charge: on capture, funds transfer straight to the connected account
      intent.status = "paid_out";
    }
    this.byIdem.set(`capture:${idempotencyKey}`, intent.id);
    return intent;
  }

  refund(intentId: string, idempotencyKey: string): Intent {
    const intent = this.intents.get(intentId);
    if (!intent) throw Errors.payment("Unknown payment intent");
    const seen = this.byIdem.get(`refund:${idempotencyKey}`);
    if (seen) return this.intents.get(seen)!;
    intent.status = "refunded";
    this.byIdem.set(`refund:${idempotencyKey}`, intent.id);
    return intent;
  }
}

export function makeProvider(): PaymentProvider {
  // if (config.stripeKey) return new StripeTestAdapter(config.stripeKey)  // wires real test mode
  void config.stripeKey;
  return new SandboxStripe();
}

// ---------------------------------------------------------------------------
// DB-level payment service. Persists the no-custody flow against bookings and
// enforces verification gating + idempotency at the application boundary.
// ---------------------------------------------------------------------------

interface OrgRow {
  id: string;
  verified: number;
  owner_user_id: string;
}
interface VerRow {
  payout_setup: number;
}
interface BookingRow {
  id: string;
  org_id: string;
  customer_user_id: string;
  total: number;
  pay_method: string;
}

function idempotent<T>(db: DB, scope: string, key: string | undefined, fn: () => T): T {
  if (!key) return fn();
  const hit = db.prepare(`SELECT response_json FROM idempotency WHERE key = ? AND scope = ?`).get(key, scope) as
    | { response_json: string }
    | undefined;
  if (hit) return JSON.parse(hit.response_json) as T;
  const result = fn();
  db.prepare(`INSERT INTO idempotency (key, scope, response_json, created_at) VALUES (?, ?, ?, ?)`).run(
    key,
    scope,
    JSON.stringify(result),
    now(),
  );
  return result;
}

// Authorize an in-app payment for a booking the customer owns.
export function authorizeBookingPayment(
  db: DB,
  provider: PaymentProvider,
  actorUserId: string,
  bookingId: string,
  idempotencyKey?: string,
) {
  return idempotent(db, `pay:authorize:${bookingId}`, idempotencyKey, () => {
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(bookingId) as BookingRow | undefined;
    if (!booking) throw Errors.notFound("Booking not found");
    // tenancy: only the booking's own customer can pay it
    if (booking.customer_user_id !== actorUserId) throw Errors.forbidden();

    const org = db.prepare(`SELECT id, verified, owner_user_id FROM orgs WHERE id = ?`).get(booking.org_id) as
      | OrgRow
      | undefined;
    if (!org) throw Errors.notFound("Provider not found");

    // GATE: unverified providers cannot take in-app payments by ANY path (I15/I20).
    if (!org.verified) throw Errors.forbidden("This provider can only take payment in person");
    const ver = db.prepare(`SELECT payout_setup FROM verification WHERE org_id = ?`).get(org.id) as
      | VerRow
      | undefined;
    if (!ver?.payout_setup) throw Errors.forbidden("Provider has no payout account set up");

    const destination = `acct_${org.id}`; // the provider's connected account (funds destination)
    const intent = provider.createIntent({
      amount: booking.total,
      destination,
      idempotencyKey: idempotencyKey ?? `${bookingId}:${now()}`,
      metadata: { bookingId },
    });

    const paymentId = id("pay");
    db.prepare(
      `INSERT INTO payments (id, booking_id, org_id, customer_user_id, amount, application_fee, method, status, provider_ref, destination_account, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'in_app', ?, ?, ?, ?)`,
    ).run(paymentId, bookingId, org.id, actorUserId, booking.total, intent.status, intent.id, destination, now());
    db.prepare(`UPDATE bookings SET pay_method = 'in_app' WHERE id = ?`).run(bookingId);
    audit(db, {
      actorUserId,
      action: "payment.authorized",
      targetType: "payment",
      targetId: paymentId,
      meta: { amount: booking.total, applicationFee: 0, custodied: false },
    });
    return { paymentId, status: intent.status, providerRef: intent.id, applicationFee: 0 };
  });
}

// Capture (provider, on completion) → funds settle to the provider's connected account.
export function captureBookingPayment(
  db: DB,
  provider: PaymentProvider,
  ownerUserId: string,
  paymentId: string,
  idempotencyKey?: string,
) {
  return idempotent(db, `pay:capture:${paymentId}`, idempotencyKey, () => {
    const pay = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(paymentId) as
      | { id: string; org_id: string; provider_ref: string; status: string }
      | undefined;
    if (!pay) throw Errors.notFound("Payment not found");
    const org = db.prepare(`SELECT owner_user_id FROM orgs WHERE id = ?`).get(pay.org_id) as
      | { owner_user_id: string }
      | undefined;
    if (!org || org.owner_user_id !== ownerUserId) throw Errors.forbidden();

    const intent = provider.capture(pay.provider_ref, idempotencyKey ?? `cap:${paymentId}`);
    db.prepare(`UPDATE payments SET status = ?, captured_at = ?, paid_out_at = ? WHERE id = ?`).run(
      intent.status,
      now(),
      intent.status === "paid_out" ? now() : null,
      paymentId,
    );
    audit(db, {
      actorUserId: ownerUserId,
      action: "payment.captured",
      targetType: "payment",
      targetId: paymentId,
      meta: { status: intent.status, custodied: false },
    });
    return { paymentId, status: intent.status };
  });
}
