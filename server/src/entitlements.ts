import type { DB } from "./db.js";

export type Tier = "solo" | "growth" | "fleet";

// The locked three-tier model. What scales is leads / client slots / seats — NEVER
// total bookings. Own-client bookings are unlimited on every tier.
export const TIERS: Record<
  Tier,
  { price: number; leadsPerMonth: number; clientSlots: number; seats: number; label: string }
> = {
  solo: { price: 39, leadsPerMonth: 20, clientSlots: 40, seats: 1, label: "Solo" },
  growth: { price: 117, leadsPerMonth: 90, clientSlots: 250, seats: 6, label: "Growth" },
  fleet: { price: 268, leadsPerMonth: Infinity, clientSlots: Infinity, seats: Infinity, label: "Fleet" },
};

function monthStart(d = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function leadsUsedThisMonth(db: DB, orgId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM leads WHERE org_id = ? AND created_at >= ?`)
    .get(orgId, monthStart()) as { n: number };
  return row.n;
}

// Distinct customers an org has ever served (its "clients").
export function clientCount(db: DB, orgId: string): number {
  const row = db
    .prepare(`SELECT COUNT(DISTINCT customer_user_id) AS n FROM bookings WHERE org_id = ?`)
    .get(orgId) as { n: number };
  return row.n;
}

export interface Entitlements {
  tier: Tier;
  leads: { used: number; cap: number | null; remaining: number | null };
  clients: { used: number; cap: number | null; remaining: number | null };
  seats: number | null;
  ai: { customer: boolean; providerSuite: boolean; copilot: boolean; voice: boolean };
}

export function entitlements(db: DB, orgId: string, tier: Tier): Entitlements {
  const t = TIERS[tier];
  const leadsUsed = leadsUsedThisMonth(db, orgId);
  const clients = clientCount(db, orgId);
  const cap = (n: number) => (n === Infinity ? null : n);
  const rem = (used: number, n: number) => (n === Infinity ? null : Math.max(0, n - used));
  return {
    tier,
    leads: { used: leadsUsed, cap: cap(t.leadsPerMonth), remaining: rem(leadsUsed, t.leadsPerMonth) },
    clients: { used: clients, cap: cap(t.clientSlots), remaining: rem(clients, t.clientSlots) },
    seats: cap(t.seats),
    ai: {
      customer: true, // customer-facing AI on all tiers
      providerSuite: tier === "growth" || tier === "fleet",
      copilot: tier === "fleet",
      voice: tier === "fleet",
    },
  };
}

// Would adding one more marketplace lead for a brand-new customer exceed the cap?
export function leadCapReached(db: DB, orgId: string, tier: Tier): boolean {
  const t = TIERS[tier];
  if (t.leadsPerMonth === Infinity) return false;
  return leadsUsedThisMonth(db, orgId) >= t.leadsPerMonth;
}

export function clientCapReached(db: DB, orgId: string, tier: Tier): boolean {
  const t = TIERS[tier];
  if (t.clientSlots === Infinity) return false;
  return clientCount(db, orgId) >= t.clientSlots;
}
