import type { Db } from "./database.js";
import { Errors } from "./lib.js";
import { audit } from "./audit.js";

// FW29 storefront theming. Theming is DATA, not code (I16); a provider themes only
// their own org (I17); low-contrast themes are blocked before publish (I18).

export const DEFAULT_THEME: Record<string, string> = {
  "brand.primary": "#3C6A75",
  "brand.accent": "#5E8B96",
  "brand.canvas": "#F2F4F4",
  "brand.ink": "#1A1A1A",
  "brand.onPrimary": "#FFFFFF",
  "font.display": "Sora",
  "font.body": "Inter",
};

export async function getTheme(db: Db, orgId: string): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string }>(`SELECT key, value FROM theme_tokens WHERE org_id = ?`, [orgId]);
  const theme = { ...DEFAULT_THEME };
  for (const r of rows) theme[r.key] = r.value;
  return theme;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const c = [0, 1, 2].map((i) => {
    const v = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export async function publishTheme(
  db: Db,
  ownerUserId: string,
  orgId: string,
  tokens: Record<string, string>,
): Promise<{ published: true; theme: Record<string, string> }> {
  const org = await db.get<{ owner_user_id: string }>(`SELECT owner_user_id FROM orgs WHERE id = ?`, [orgId]);
  if (!org) throw Errors.notFound("Provider not found");
  if (org.owner_user_id !== ownerUserId) throw Errors.forbidden("You can only theme your own storefront");

  const merged = { ...DEFAULT_THEME, ...tokens };
  const checks: [string, string][] = [
    [merged["brand.onPrimary"], merged["brand.primary"]],
    [merged["brand.ink"], merged["brand.canvas"]],
  ];
  for (const [fg, bg] of checks) {
    if (contrastRatio(fg, bg) < 4.5) {
      throw Errors.badRequest(
        `Theme fails WCAG AA contrast (${contrastRatio(fg, bg).toFixed(2)}:1, need 4.5:1) — pick higher-contrast colours`,
      );
    }
  }

  await db.tx(async (t) => {
    for (const [k, v] of Object.entries(tokens)) {
      await t.run(
        `INSERT INTO theme_tokens (org_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT (org_id, key) DO UPDATE SET value = excluded.value`,
        [orgId, k, v],
      );
    }
  });
  await audit(db, { actorUserId: ownerUserId, action: "theme.published", targetType: "org", targetId: orgId });
  return { published: true, theme: await getTheme(db, orgId) };
}
