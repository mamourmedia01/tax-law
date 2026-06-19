import type { Db } from "./database.js";

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

export async function leadsUsedThisMonth(db: Db, orgId: string): Promise<number> {
  const row = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM leads WHERE org_id = ? AND created_at >= ?`,
    [orgId, monthStart()],
  );
  return Number(row?.n ?? 0);
}

// Distinct customers an org has ever served (its "clients").
export async function clientCount(db: Db, orgId: string): Promise<number> {
  const row = await db.get<{ n: number }>(
    `SELECT COUNT(DISTINCT customer_user_id) AS n FROM bookings WHERE org_id = ?`,
    [orgId],
  );
  return Number(row?.n ?? 0);
}

export interface Entitlements {
  tier: Tier;
  leads: { used: number; cap: number | null; remaining: number | null };
  clients: { used: number; cap: number | null; remaining: number | null };
  seats: number | null;
  ai: { customer: boolean; providerSuite: boolean; copilot: boolean; voice: boolean };
}

export async function entitlements(db: Db, orgId: string, tier: Tier): Promise<Entitlements> {
  const t = TIERS[tier];
  const leadsUsed = await leadsUsedThisMonth(db, orgId);
  const clients = await clientCount(db, orgId);
  const cap = (n: number) => (n === Infinity ? null : n);
  const rem = (used: number, n: number) => (n === Infinity ? null : Math.max(0, n - used));
  return {
    tier,
    leads: { used: leadsUsed, cap: cap(t.leadsPerMonth), remaining: rem(leadsUsed, t.leadsPerMonth) },
    clients: { used: clients, cap: cap(t.clientSlots), remaining: rem(clients, t.clientSlots) },
    seats: cap(t.seats),
    ai: {
      customer: true,
      providerSuite: tier === "growth" || tier === "fleet",
      copilot: tier === "fleet",
      voice: tier === "fleet",
    },
  };
}

export async function leadCapReached(db: Db, orgId: string, tier: Tier): Promise<boolean> {
  const t = TIERS[tier];
  if (t.leadsPerMonth === Infinity) return false;
  return (await leadsUsedThisMonth(db, orgId)) >= t.leadsPerMonth;
}

export async function clientCapReached(db: Db, orgId: string, tier: Tier): Promise<boolean> {
  const t = TIERS[tier];
  if (t.clientSlots === Infinity) return false;
  return (await clientCount(db, orgId)) >= t.clientSlots;
}
