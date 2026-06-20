import type { Db } from "./database.js";
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
  rebook_nudges: number;
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

export async function listProviders(
  db: Db,
  opts: { q?: string; category?: string; verifiedOnly?: boolean; sort?: string },
) {
  // Filter/sort in SQL so it scales (works on both dialects).
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.q) {
    where.push(`(LOWER(name) LIKE ? OR LOWER(tagline) LIKE ? OR LOWER(area) LIKE ? OR LOWER(categories) LIKE ?)`);
    const like = `%${opts.q.toLowerCase()}%`;
    params.push(like, like, like, like);
  }
  if (opts.category) {
    where.push(`LOWER(categories) LIKE ?`);
    params.push(`%${opts.category.toLowerCase()}%`);
  }
  if (opts.verifiedOnly) where.push(`verified = 1`);
  const order =
    opts.sort === "price" ? `price_from ASC` : opts.sort === "distance" ? `distance_km ASC` : `rating DESC`;
  const sql = `SELECT * FROM orgs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT 200`;
  const rows = await db.all<OrgRow>(sql, params);
  return rows.map(publicOrg);
}

export async function getProviderBySlug(db: Db, slug: string) {
  const o = await db.get<OrgRow>(`SELECT * FROM orgs WHERE slug = ?`, [slug]);
  if (!o) throw Errors.notFound("Provider not found");
  const services = await db.all(
    `SELECT id, name, description, duration_min AS "durationMin", price FROM services WHERE org_id = ? AND active = 1`,
    [o.id],
  );
  const reviews = await db.all(`SELECT id, author, rating, text, date FROM reviews WHERE org_id = ?`, [o.id]);
  const gallery = await db.all(`SELECT id, label, before, after FROM gallery WHERE org_id = ?`, [o.id]);
  return { ...publicOrg(o), services, reviews, gallery, theme: await getTheme(db, o.id) };
}

export async function orgForOwner(db: Db, userId: string): Promise<OrgRow | undefined> {
  return db.get<OrgRow>(`SELECT * FROM orgs WHERE owner_user_id = ?`, [userId]);
}
