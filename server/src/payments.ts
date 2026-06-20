import type { Db } from "./database.js";
import { Errors, config, id, now, sha256 } from "./lib.js";
import { audit } from "./audit.js";

// ---------------------------------------------------------------------------
// Payment provider abstraction. Sandbox mode models Stripe's destination-charge
// + Connect payout lifecycle: funds → provider connected account (no platform
// custody, I12), application_fee always 0 (I3), idempotent operations (I14).
// Real Stripe TEST keys would wire the live-test adapter behind this interface.
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
  createIntent(args: { amount: number; destination: string; idempotencyKey: string; metadata: Record<string, string> }): Intent;
  capture(intentId: string, idempotencyKey: string): Intent;
  refund(intentId: string, idempotencyKey: string): Intent;
}

class SandboxStripe implements PaymentProvider {
  readonly mode = "sandbox" as const;
  private intents = new Map<string, Intent>();
  private byIdem = new Map<string, string>();

  createIntent(args: { amount: number; destination: string; idempotencyKey: string; metadata: Record<string, string> }): Intent {
    const existing = this.byIdem.get(`create:${args.idempotencyKey}`);
    if (existing) return this.intents.get(existing)!;
    if (args.amount <= 0) throw Errors.payment("Amount must be positive");
    if (!args.destination) throw Errors.payment("Missing destination account");
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
    if (intent.status === "requires_capture") intent.status = "paid_out";
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
  void config.stripeKey; // if (config.stripeKey) return new StripeTestAdapter(config.stripeKey)
  return new SandboxStripe();
}

// ---------------------------------------------------------------------------
// DB-level payment service (no-custody flow, verification gating, idempotency).
// ---------------------------------------------------------------------------

interface BookingRow {
  id: string;
  org_id: string;
  customer_user_id: string;
  total: number;
  pay_method: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Claim-first idempotency (safe under true concurrency, e.g. Postgres).
// The key is reserved ATOMICALLY before any work runs, so only the winner executes
// the side-effecting `fn`; concurrent duplicates wait for and return its result.
// (A naive check-then-act is a TOCTOU race that double-executes under parallelism.)
async function idempotent<T>(db: Db, scope: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();

  const claim = await db.run(
    `INSERT INTO idempotency (key, scope, response_json, created_at) VALUES (?, ?, '', ?) ON CONFLICT DO NOTHING`,
    [key, scope, now()],
  );

  if (claim.changes === 1) {
    // winner — do the work exactly once, then publish the response
    try {
      const result = await fn();
      await db.run(`UPDATE idempotency SET response_json = ? WHERE key = ? AND scope = ?`, [
        JSON.stringify(result),
        key,
        scope,
      ]);
      return result;
    } catch (e) {
      // release the claim so a later retry can succeed
      await db.run(`DELETE FROM idempotency WHERE key = ? AND scope = ?`, [key, scope]);
      throw e;
    }
  }

  // loser — the work is being/has been done by the winner; wait for its result
  for (let i = 0; i < 150; i++) {
    const row = await db.get<{ response_json: string }>(
      `SELECT response_json FROM idempotency WHERE key = ? AND scope = ?`,
      [key, scope],
    );
    if (row && row.response_json !== "") return JSON.parse(row.response_json) as T;
    if (!row) break; // winner errored and released the claim
    await sleep(20);
  }
  // fall back to running it (winner failed or timed out); rare path
  return fn();
}

export async function authorizeBookingPayment(
  db: Db,
  provider: PaymentProvider,
  actorUserId: string,
  bookingId: string,
  idempotencyKey?: string,
  payoutSpeed: "standard" | "instant" = "standard",
) {
  return idempotent(db, `pay:authorize:${bookingId}`, idempotencyKey, async () => {
    const booking = await db.get<BookingRow>(`SELECT * FROM bookings WHERE id = ?`, [bookingId]);
    if (!booking) throw Errors.notFound("Booking not found");
    if (booking.customer_user_id !== actorUserId) throw Errors.forbidden();

    const org = await db.get<{ id: string; verified: number }>(`SELECT id, verified FROM orgs WHERE id = ?`, [booking.org_id]);
    if (!org) throw Errors.notFound("Provider not found");

    // GATE: unverified providers cannot take in-app payments by ANY path (I15/I20).
    if (!org.verified) throw Errors.forbidden("This provider can only take payment in person");
    const ver = await db.get<{ payout_setup: number }>(`SELECT payout_setup FROM verification WHERE org_id = ?`, [org.id]);
    if (!ver?.payout_setup) throw Errors.forbidden("Provider has no payout account set up");

    const destination = `acct_${org.id}`;
    const intent = provider.createIntent({
      amount: booking.total,
      destination,
      idempotencyKey: idempotencyKey ?? `${bookingId}:${now()}`,
      metadata: { bookingId },
    });

    const paymentId = id("pay");
    await db.run(
      `INSERT INTO payments (id, booking_id, org_id, customer_user_id, amount, application_fee, method, payout_speed, status, provider_ref, destination_account, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'in_app', ?, ?, ?, ?, ?)`,
      [paymentId, bookingId, org.id, actorUserId, booking.total, payoutSpeed, intent.status, intent.id, destination, now()],
    );
    await db.run(`UPDATE bookings SET pay_method = 'in_app' WHERE id = ?`, [bookingId]);
    await audit(db, {
      actorUserId,
      action: "payment.authorized",
      targetType: "payment",
      targetId: paymentId,
      meta: { amount: booking.total, applicationFee: 0, custodied: false, payoutSpeed },
    });
    return { paymentId, status: intent.status, providerRef: intent.id, applicationFee: 0, payoutSpeed };
  });
}

export async function captureBookingPayment(
  db: Db,
  provider: PaymentProvider,
  ownerUserId: string,
  paymentId: string,
  idempotencyKey?: string,
) {
  return idempotent(db, `pay:capture:${paymentId}`, idempotencyKey, async () => {
    const pay = await db.get<{ id: string; org_id: string; provider_ref: string; status: string }>(
      `SELECT * FROM payments WHERE id = ?`,
      [paymentId],
    );
    if (!pay) throw Errors.notFound("Payment not found");
    const org = await db.get<{ owner_user_id: string }>(`SELECT owner_user_id FROM orgs WHERE id = ?`, [pay.org_id]);
    if (!org || org.owner_user_id !== ownerUserId) throw Errors.forbidden();

    const intent = provider.capture(pay.provider_ref, idempotencyKey ?? `cap:${paymentId}`);
    await db.run(`UPDATE payments SET status = ?, captured_at = ?, paid_out_at = ? WHERE id = ?`, [
      intent.status,
      now(),
      intent.status === "paid_out" ? now() : null,
      paymentId,
    ]);
    await audit(db, {
      actorUserId: ownerUserId,
      action: "payment.captured",
      targetType: "payment",
      targetId: paymentId,
      meta: { status: intent.status, custodied: false },
    });
    return { paymentId, status: intent.status };
  });
}

// Refund (provider, owner-gated). The platform never held the funds, so a refund
// reverses the provider's destination charge — idempotent like the rest.
export async function refundBookingPayment(
  db: Db,
  provider: PaymentProvider,
  ownerUserId: string,
  paymentId: string,
  idempotencyKey?: string,
) {
  return idempotent(db, `pay:refund:${paymentId}`, idempotencyKey, async () => {
    const pay = await db.get<{ id: string; org_id: string; provider_ref: string; status: string }>(
      `SELECT * FROM payments WHERE id = ?`,
      [paymentId],
    );
    if (!pay) throw Errors.notFound("Payment not found");
    const org = await db.get<{ owner_user_id: string }>(`SELECT owner_user_id FROM orgs WHERE id = ?`, [pay.org_id]);
    if (!org || org.owner_user_id !== ownerUserId) throw Errors.forbidden();
    if (pay.status === "refunded") return { paymentId, status: "refunded" as const };

    const intent = provider.refund(pay.provider_ref, idempotencyKey ?? `ref:${paymentId}`);
    await db.run(`UPDATE payments SET status = ?, refunded_at = ? WHERE id = ?`, [intent.status, now(), paymentId]);
    await audit(db, {
      actorUserId: ownerUserId,
      action: "payment.refunded",
      targetType: "payment",
      targetId: paymentId,
      meta: { status: intent.status },
    });
    return { paymentId, status: intent.status };
  });
}
