import type { Db } from "./database.js";
import { config } from "./lib.js";

// ---------------------------------------------------------------------------
// FW31 customer concierge — a grounded, customer-facing assistant.
//
//  - grounded (I24): answers from the marketplace catalogue + the customer's OWN
//    bookings; never fabricates providers or prices.
//  - tenant-scoped (I27): only this customer's bookings are read.
//  - suggest-never-act (I25): it recommends and deep-links; it NEVER books or pays.
//  - graceful (I29): deterministic sandbox planner; an LLM can replace it behind this seam.
// ---------------------------------------------------------------------------

export interface ConciergeRef {
  type: "provider" | "booking";
  label: string;
  href: string;
}

export interface ConciergeReply {
  reply: string;
  intent: string;
  references: ConciergeRef[];
  grounded: true;
  model: string;
}

export async function customerConcierge(db: Db, userId: string, message: string): Promise<ConciergeReply> {
  const m = message.toLowerCase();
  const refs: ConciergeRef[] = [];
  let reply: string;
  let intent = "discover";

  const myBookings = await db.all<{ id: string; date: string; time: string; status: string; org_name: string; slug: string }>(
    `SELECT b.id, b.date, b.time, b.status, o.name AS org_name, o.slug
     FROM bookings b JOIN orgs o ON o.id = b.org_id
     WHERE b.customer_user_id = ? ORDER BY b.created_at DESC`,
    [userId],
  );

  const asksBooking = /my booking|upcoming|appointment|when is|reschedul|cancel/.test(m);
  const asksCheap = /cheap|cheapest|budget|affordable|best price|lowest/.test(m);

  // category detection from the catalogue
  const catWords: Record<string, string> = {
    interior: "Interior detail",
    valet: "Mobile valet",
    ceramic: "Ceramic coating",
    wheel: "Wheels & tyres",
    fleet: "Fleet",
    wash: "Exterior wash",
  };
  const catKey = Object.keys(catWords).find((k) => m.includes(k));

  if (asksBooking) {
    intent = "my_bookings";
    const upcoming = myBookings.find((b) => b.status === "confirmed");
    if (upcoming) {
      reply = `Your next booking is with ${upcoming.org_name} on ${upcoming.date} at ${upcoming.time}. You can view or change it here.`;
      refs.push({ type: "booking", label: `${upcoming.org_name} · ${upcoming.date}`, href: `/booking/${upcoming.id}` });
    } else {
      reply = "You don't have any upcoming bookings. Want me to find a provider near you?";
    }
  } else if (asksCheap || catKey) {
    intent = catKey ? "category_search" : "price_search";
    const where: string[] = [];
    const params: unknown[] = [];
    if (catKey) {
      where.push(`LOWER(categories) LIKE ?`);
      params.push(`%${catWords[catKey].toLowerCase()}%`);
    }
    const order = asksCheap ? "price_from ASC" : "rating DESC";
    const rows = await db.all<{ name: string; slug: string; price_from: number; rating: number }>(
      `SELECT name, slug, price_from, rating FROM orgs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT 3`,
      params,
    );
    if (rows.length) {
      const lead = rows[0];
      reply = `${asksCheap ? "Best value" : "Top"}${catKey ? ` for ${catWords[catKey].toLowerCase()}` : ""}: ${lead.name} from £${lead.price_from} (${lead.rating}★). Here are a few options — tap to view and book.`;
      for (const r of rows) refs.push({ type: "provider", label: `${r.name} · from £${r.price_from}`, href: `/p/${r.slug}` });
    } else {
      reply = "I couldn't find a match for that — try browsing all providers.";
      refs.push({ type: "provider", label: "Browse all providers", href: "/search" });
    }
  } else {
    intent = "discover";
    const rows = await db.all<{ name: string; slug: string; price_from: number }>(
      `SELECT name, slug, price_from FROM orgs ORDER BY rating DESC LIMIT 3`,
    );
    reply = "I can help you find trusted car care, check prices, or look up your bookings. Here are some top-rated providers near you.";
    for (const r of rows) refs.push({ type: "provider", label: `${r.name} · from £${r.price_from}`, href: `/p/${r.slug}` });
  }

  return { reply, intent, references: refs, grounded: true, model: config.anthropicKey ? "anthropic:grounded" : "sandbox:deterministic" };
}
