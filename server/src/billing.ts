import type { Db } from "./database.js";
import { Errors, config, now } from "./lib.js";
import { audit } from "./audit.js";
import { TIERS, type Tier } from "./entitlements.js";

// ---------------------------------------------------------------------------
// FW27 subscription billing.
//
// One subscription per org (I9). The provider's tier flows through here and drives
// entitlements. A sandbox billing adapter models Stripe Billing's subscribe / change /
// cancel lifecycle; drop a real Stripe key in to swap it (same seam as payments).
// No commission anywhere — this is the ONLY money the platform charges a provider.
// ---------------------------------------------------------------------------

const PERIOD = 30 * 24 * 60 * 60 * 1000;

export interface BillingProvider {
  readonly mode: "sandbox" | "stripe";
  upsertSubscription(args: { orgId: string; tier: Tier; price: number; ref?: string | null }): Promise<{ ref: string; periodEnd: number }>;
  cancel(ref: string): Promise<void>;
}

class SandboxBilling implements BillingProvider {
  readonly mode = "sandbox" as const;
  async upsertSubscription(args: { orgId: string; tier: Tier; price: number }) {
    return { ref: `sub_sand_${args.orgId.slice(-8)}`, periodEnd: now() + PERIOD };
  }
  async cancel(): Promise<void> {
    /* sandbox no-op */
  }
}

// Real Stripe Billing adapter (REST, no SDK). Creates/updates a subscription on a
// per-tier Price. Activates only when the secret key AND all three tier Price IDs
// are configured, so enabling Stripe for payments alone never breaks subscriptions.
class StripeBilling implements BillingProvider {
  readonly mode = "stripe" as const;
  constructor(private key: string, private prices: Record<string, string>) {}

  private async call(path: string, form: Record<string, string>, method = "POST"): Promise<Record<string, unknown>> {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: method === "POST" ? new URLSearchParams(form).toString() : undefined,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw Errors.payment((json.error as { message?: string } | undefined)?.message ?? `Stripe error (${res.status})`);
    return json;
  }

  async upsertSubscription(args: { orgId: string; tier: Tier; price: number; ref?: string | null }) {
    const priceId = this.prices[args.tier];
    if (!priceId) throw Errors.payment(`No Stripe Price configured for tier ${args.tier}`);
    if (args.ref) {
      // change plan: swap the subscription's single item to the new price
      const sub = await this.call(`subscriptions/${args.ref}`, {}, "GET");
      const itemId = ((sub.items as { data?: { id: string }[] } | undefined)?.data?.[0]?.id) ?? "";
      const updated = await this.call(`subscriptions/${args.ref}`, {
        "items[0][id]": itemId,
        "items[0][price]": priceId,
        proration_behavior: "create_prorations",
      });
      return { ref: updated.id as string, periodEnd: Number(updated.current_period_end) * 1000 };
    }
    const customer = await this.call("customers", { "metadata[orgId]": args.orgId });
    const sub = await this.call("subscriptions", {
      customer: customer.id as string,
      "items[0][price]": priceId,
      "metadata[orgId]": args.orgId,
    });
    return { ref: sub.id as string, periodEnd: Number(sub.current_period_end) * 1000 };
  }
  async cancel(ref: string): Promise<void> {
    await this.call(`subscriptions/${ref}`, {}, "DELETE");
  }
}

export function makeBilling(): BillingProvider {
  const p = config.stripePrices;
  if (config.stripeKey && p.solo && p.growth && p.fleet) return new StripeBilling(config.stripeKey, p);
  return new SandboxBilling();
}

export interface Subscription {
  org_id: string;
  tier: Tier;
  status: string;
  provider_ref: string | null;
  price: number;
  current_period_end: number | null;
  created_at: number;
  updated_at: number;
}

export async function getSubscription(db: Db, orgId: string): Promise<Subscription | null> {
  return (await db.get<Subscription>(`SELECT * FROM subscriptions WHERE org_id = ?`, [orgId])) ?? null;
}

// Subscribe or change plan. Updates the subscription AND the org tier (which the
// entitlement engine reads), atomically.
export async function setSubscription(
  db: Db,
  billing: BillingProvider,
  orgId: string,
  tier: Tier,
): Promise<Subscription> {
  if (!TIERS[tier]) throw Errors.badRequest("Unknown tier");
  const price = TIERS[tier].price;
  const existing = await getSubscription(db, orgId);
  const sub = await billing.upsertSubscription({ orgId, tier, price, ref: existing?.provider_ref ?? null });

  await db.tx(async (t) => {
    await t.run(
      `INSERT INTO subscriptions (org_id, tier, status, provider_ref, price, current_period_end, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
       ON CONFLICT (org_id) DO UPDATE SET tier = excluded.tier, status = 'active',
         provider_ref = excluded.provider_ref, price = excluded.price,
         current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
      [orgId, tier, sub.ref, price, sub.periodEnd, now(), now()],
    );
    await t.run(`UPDATE orgs SET tier = ? WHERE id = ?`, [tier, orgId]);
  });
  await audit(db, { action: "subscription.set", targetType: "org", targetId: orgId, meta: { tier, price } });
  return (await getSubscription(db, orgId))!;
}

export async function cancelSubscription(db: Db, billing: BillingProvider, orgId: string): Promise<Subscription> {
  const sub = await getSubscription(db, orgId);
  if (!sub) throw Errors.notFound("No subscription");
  if (sub.provider_ref) await billing.cancel(sub.provider_ref);
  await db.run(`UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE org_id = ?`, [now(), orgId]);
  await audit(db, { action: "subscription.canceled", targetType: "org", targetId: orgId });
  return (await getSubscription(db, orgId))!;
}

export const TIER_CATALOG = (Object.keys(TIERS) as Tier[]).map((t) => ({
  tier: t,
  label: TIERS[t].label,
  price: TIERS[t].price,
  leadsPerMonth: TIERS[t].leadsPerMonth === Infinity ? null : TIERS[t].leadsPerMonth,
  clientSlots: TIERS[t].clientSlots === Infinity ? null : TIERS[t].clientSlots,
  seats: TIERS[t].seats === Infinity ? null : TIERS[t].seats,
}));
