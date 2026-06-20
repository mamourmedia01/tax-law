import type { Db } from "./database.js";
import { Errors } from "./lib.js";
import { getTheme } from "./theming.js";

// "The Gleam" branded share card — an SVG generated from the provider's data + theme.
// SVG keeps it offline and crisp; a raster endpoint could render it via headless Chrome.
export async function providerShareCard(db: Db, slug: string): Promise<string> {
  const o = await db.get<{ id: string; name: string; tagline: string; rating: number; review_count: number; price_from: number; area: string }>(
    `SELECT id, name, tagline, rating, review_count, price_from, area FROM orgs WHERE slug = ?`,
    [slug],
  );
  if (!o) throw Errors.notFound("Provider not found");
  const theme = await getTheme(db, o.id);
  const primary = theme["brand.primary"] ?? "#3C6A75";
  const accent = theme["brand.accent"] ?? "#5E8B96";
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}"/><stop offset="100%" stop-color="${primary}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(80,90)" fill="#F2F4F4" font-family="Inter, sans-serif">
    <g>
      <rect x="0" y="0" width="84" height="84" rx="20" fill="#ffffff" opacity="0.18"/>
      <rect x="34" y="14" width="16" height="56" rx="8" fill="#F2F4F4"/>
      <rect x="14" y="34" width="56" height="16" rx="8" fill="#F2F4F4"/>
    </g>
    <text x="110" y="56" font-size="40" font-weight="700">Fable+</text>
    <text x="0" y="210" font-size="74" font-weight="800" font-family="Sora, sans-serif">${esc(o.name)}</text>
    <text x="0" y="270" font-size="34" opacity="0.92">${esc(o.tagline)}</text>
    <g transform="translate(0,360)" font-size="30" opacity="0.95">
      <text x="0" y="0" font-weight="700">★ ${o.rating.toFixed(1)}</text>
      <text x="120" y="0">${o.review_count} reviews</text>
      <text x="360" y="0">from £${o.price_from}</text>
      <text x="560" y="0">${esc(o.area)}</text>
    </g>
    <g transform="translate(0,440)">
      <rect x="0" y="0" width="340" height="72" rx="16" fill="#ffffff"/>
      <text x="170" y="48" font-size="30" font-weight="700" fill="${primary}" text-anchor="middle">Book on Fable+</text>
    </g>
    <text x="0" y="470" dy="120" font-size="24" opacity="0.85">No platform fees · pay your provider directly</text>
  </g>
</svg>`;
}
