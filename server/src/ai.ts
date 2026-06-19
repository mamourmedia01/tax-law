import type { Db } from "./database.js";
import { config } from "./lib.js";
import { entitlements } from "./entitlements.js";
import type { Tier } from "./entitlements.js";

// The provider copilot — grounded (I24), suggest-never-act (I25), explainable (I26),
// tenant-isolated (I27), never moves money (I28, no payment import), graceful (I29).

export interface Suggestion {
  title: string;
  detail: string;
  reason: string;
  action: string;
}

function dow(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function providerCopilot(db: Db, orgId: string, tier: Tier) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const bookings = await db.all<{ date: string; total: number; source: string; customer_user_id: string; status: string }>(
    `SELECT date, total, source, customer_user_id, status FROM bookings WHERE org_id = ?`,
    [orgId],
  );
  const active = bookings.filter((b) => b.status !== "cancelled");
  const thisMonth = active.filter((b) => {
    const [y, m, d] = b.date.split("-").map(Number);
    return new Date(y, m - 1, d).getTime() >= monthStart;
  });
  const revenue = active.reduce((s, b) => s + b.total, 0);
  const monthRevenue = thisMonth.reduce((s, b) => s + b.total, 0);
  const byCustomer = new Map<string, number>();
  for (const b of active) byCustomer.set(b.customer_user_id, (byCustomer.get(b.customer_user_id) ?? 0) + 1);
  const repeatRate = byCustomer.size ? [...byCustomer.values()].filter((n) => n > 1).length / byCustomer.size : 0;
  const dayCounts = new Array(7).fill(0);
  for (const b of active) dayCounts[dow(b.date)]++;
  const busiestDay = dayCounts.indexOf(Math.max(...dayCounts));
  const ent = await entitlements(db, orgId, tier);

  const grounded = {
    totalBookings: active.length,
    bookingsThisMonth: thisMonth.length,
    revenueAllTime: Math.round(revenue),
    revenueThisMonth: Math.round(monthRevenue),
    distinctCustomers: byCustomer.size,
    repeatRate: Math.round(repeatRate * 100),
    leadsUsed: ent.leads.used,
    leadsCap: ent.leads.cap,
  };

  const suggestions: Suggestion[] = [];
  if (ent.leads.cap !== null && ent.leads.remaining !== null && ent.leads.remaining <= 3) {
    suggestions.push({
      title: "You're close to your marketplace lead limit",
      detail: `You've used ${ent.leads.used} of ${ent.leads.cap} leads this month.`,
      reason: `Lead usage (${ent.leads.used}/${ent.leads.cap}) is within 3 of your ${tier} cap.`,
      action: "Review the Growth tier (more leads) — needs your approval",
    });
  }
  if (grounded.repeatRate < 30 && byCustomer.size >= 3) {
    suggestions.push({
      title: "Win back more repeat customers",
      detail: `Only ${grounded.repeatRate}% of your customers have booked more than once.`,
      reason: `Repeat rate computed from your ${byCustomer.size} customers across ${active.length} bookings.`,
      action: "Draft a rebook reminder for lapsed customers — you approve before it sends",
    });
  }
  if (active.length > 0) {
    suggestions.push({
      title: `Promote your ${DAYS[busiestDay]} availability`,
      detail: `${DAYS[busiestDay]} is your most-booked day.`,
      reason: `Derived from the day-of-week distribution of your ${active.length} bookings.`,
      action: "Add more slots or a small off-peak offer — your call",
    });
  }
  if (active.length === 0) {
    suggestions.push({
      title: "Share your storefront to get your first booking",
      detail: "You have no bookings yet, so there's nothing to analyse.",
      reason: "No bookings found for your org — the copilot won't invent figures (grounded).",
      action: "Share your storefront link",
    });
  }

  return {
    grounded: true,
    suggestNeverAct: true,
    model: config.anthropicKey ? "anthropic:grounded" : "sandbox:deterministic",
    generatedFrom: grounded,
    suggestions,
  };
}
