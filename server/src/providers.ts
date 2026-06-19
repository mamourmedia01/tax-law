import type { DB } from "./db.js";
import { Errors } from "./lib.js";
import { getTheme } from "./theming.js";

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  categories: string;
  about: string;
  area: string;
  distance_km: number;
  seed: string;
  tier: string;
  verified: number;
  rating: number;
  review_count: number;
  price_from: number;
  next_slot: string;
}

function publicOrg(o: OrgRow) {
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    tagline: o.tagline,
    category: o.category,
    categories: JSON.parse(o.categories || "[]"),
    about: o.about,
    area: o.area,
    distanceKm: o.distance_km,
    seed: o.seed,
    verified: !!o.verified,
    rating: o.rating,
    reviewCount: o.review_count,
    priceFrom: o.price_from,
    nextSlot: o.next_slot,
  };
}

export function listProviders(db: DB, opts: { q?: string; category?: string; verifiedOnly?: boolean; sort?: string }) {
  let rows = db.prepare(`SELECT * FROM orgs`).all() as OrgRow[];
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.tagline.toLowerCase().includes(q) ||
        o.area.toLowerCase().includes(q) ||
        o.categories.toLowerCase().includes(q),
    );
  }
  if (opts.category) rows = rows.filter((o) => JSON.parse(o.categories || "[]").includes(opts.category));
  if (opts.verifiedOnly) rows = rows.filter((o) => o.verified);
  if (opts.sort === "price") rows.sort((a, b) => a.price_from - b.price_from);
  else if (opts.sort === "distance") rows.sort((a, b) => a.distance_km - b.distance_km);
  else rows.sort((a, b) => b.rating - a.rating);
  return rows.map(publicOrg);
}

export function getProviderBySlug(db: DB, slug: string) {
  const o = db.prepare(`SELECT * FROM orgs WHERE slug = ?`).get(slug) as OrgRow | undefined;
  if (!o) throw Errors.notFound("Provider not found");
  const services = db
    .prepare(`SELECT id, name, description, duration_min AS durationMin, price FROM services WHERE org_id = ? AND active = 1`)
    .all(o.id);
  const reviews = db.prepare(`SELECT id, author, rating, text, date FROM reviews WHERE org_id = ?`).all(o.id);
  const gallery = db.prepare(`SELECT id, label, before, after FROM gallery WHERE org_id = ?`).all(o.id);
  return { ...publicOrg(o), services, reviews, gallery, theme: getTheme(db, o.id) };
}

// The org owned by a given user (a provider account).
export function orgForOwner(db: DB, userId: string): OrgRow | undefined {
  return db.prepare(`SELECT * FROM orgs WHERE owner_user_id = ?`).get(userId) as OrgRow | undefined;
}
