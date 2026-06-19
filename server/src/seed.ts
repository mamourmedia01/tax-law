import type { Db } from "./database.js";
import { openDb } from "./database.js";
import { id, now } from "./lib.js";
import { runSandboxKyc, setStep } from "./verification.js";

interface SeedService {
  name: string;
  description: string;
  durationMin: number;
  price: number;
}
interface SeedProvider {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  categories: string[];
  about: string;
  area: string;
  distanceKm: number;
  seed: string;
  tier: "solo" | "growth" | "fleet";
  fullyVerified: boolean;
  rating: number;
  reviewCount: number;
  nextSlot: string;
  services: SeedService[];
  reviews: { author: string; rating: number; text: string; date: string }[];
  gallery: { label: string; before: string; after: string }[];
}

export const SEED_PROVIDERS: SeedProvider[] = [
  {
    slug: "jamies-mobile-valet",
    name: "Jamie's Mobile Valet",
    tagline: "Showroom shine at your door",
    category: "Mobile valet",
    categories: ["Mobile valet", "Interior detail", "Exterior wash"],
    about:
      "Family-run mobile valeting covering East London. We bring the water, the power and the polish — you just hand over the keys.",
    area: "Hackney, London",
    distanceKm: 1.2,
    seed: "1a6f78",
    tier: "growth",
    fullyVerified: true,
    rating: 4.9,
    reviewCount: 218,
    nextSlot: "Today, 2:00 PM",
    services: [
      { name: "Express Wash & Go", description: "Exterior hand wash, wheels, windows and a quick tyre dress.", durationMin: 45, price: 35 },
      { name: "Full Valet", description: "Inside-out clean: exterior wash, interior vac, dashboard, glass and mats.", durationMin: 120, price: 75 },
      { name: "Interior Deep Clean", description: "Seats, carpets and trim shampooed, steam-cleaned and protected.", durationMin: 150, price: 95 },
      { name: "Wax & Protect", description: "Hand wash plus a hard carnauba wax for a deep, lasting gloss.", durationMin: 90, price: 60 },
    ],
    reviews: [
      { author: "Priya S.", rating: 5, date: "2026-06-10", text: "Car came up like new. Jamie was bang on time and so easy to deal with." },
      { author: "Tom W.", rating: 5, date: "2026-06-04", text: "Booked the full valet — genuinely the cleanest it's been since I bought it." },
      { author: "Aisha K.", rating: 4, date: "2026-05-28", text: "Great job on the interior. A few minutes late but messaged ahead." },
    ],
    gallery: [
      { label: "Saloon · full valet", before: "5b6b6f", after: "2bb3c9" },
      { label: "Alloy refresh", before: "55525a", after: "8fb9c4" },
    ],
  },
  {
    slug: "gleamworks-detailing",
    name: "GleamWorks Detailing",
    tagline: "Detailing obsessives",
    category: "Ceramic coating",
    categories: ["Ceramic coating", "Exterior wash", "Interior detail"],
    about: "Specialist paint correction and ceramic coatings. We treat every car like a concours entry.",
    area: "Islington, London",
    distanceKm: 2.7,
    seed: "2e535c",
    tier: "fleet",
    fullyVerified: true,
    rating: 4.8,
    reviewCount: 142,
    nextSlot: "Tomorrow, 9:30 AM",
    services: [
      { name: "Maintenance Wash", description: "Safe two-bucket wash to keep a coated car looking its best.", durationMin: 60, price: 49 },
      { name: "Enhancement Polish", description: "Single-stage machine polish to lift gloss and remove light swirls.", durationMin: 180, price: 180 },
      { name: "Ceramic Coating 3yr", description: "Full prep, paint correction and a 3-year ceramic coating.", durationMin: 360, price: 450 },
    ],
    reviews: [
      { author: "Marcus D.", rating: 5, date: "2026-06-12", text: "The ceramic coating is unreal. Water just sheets off it now." },
      { author: "Lena P.", rating: 5, date: "2026-05-30", text: "Worth every penny. The paint looks deeper than when it was new." },
    ],
    gallery: [
      { label: "Black paint correction", before: "3a3f42", after: "1a6f78" },
      { label: "Ceramic gloss", before: "5b6b6f", after: "29a3bf" },
    ],
  },
  {
    slug: "sparkle-on-wheels",
    name: "Sparkle On Wheels",
    tagline: "Quick, friendly, affordable",
    category: "Exterior wash",
    categories: ["Exterior wash", "Wheels & tyres"],
    about: "Friendly local washers doing honest work at honest prices. Perfect for a regular weekly tidy-up.",
    area: "Camden, London",
    distanceKm: 3.4,
    seed: "759ea8",
    tier: "solo",
    fullyVerified: true,
    rating: 4.7,
    reviewCount: 96,
    nextSlot: "Today, 5:15 PM",
    services: [
      { name: "Mini Wash", description: "Quick exterior rinse, shampoo and dry. In and out.", durationMin: 30, price: 20 },
      { name: "Wash & Wheels", description: "Exterior wash plus a proper wheel and tyre clean.", durationMin: 45, price: 30 },
      { name: "Weekly Plan Wash", description: "Your standard wash, booked as a recurring weekly slot.", durationMin: 30, price: 18 },
    ],
    reviews: [
      { author: "Dev R.", rating: 5, date: "2026-06-08", text: "Cheap and cheerful, but they don't cut corners. Booked them weekly now." },
      { author: "Sophie L.", rating: 4, date: "2026-05-22", text: "Good value. Turned up with everything they needed." },
    ],
    gallery: [{ label: "City runabout", before: "57606a", after: "7fb0bd" }],
  },
  {
    slug: "interior-revival-co",
    name: "Interior Revival Co.",
    tagline: "We rescue tired interiors",
    category: "Interior detail",
    categories: ["Interior detail", "Mobile valet"],
    about: "Interiors are all we do. Pet hair, coffee spills, kids, mud — bring us your worst.",
    area: "Shoreditch, London",
    distanceKm: 1.9,
    seed: "4e7a85",
    tier: "growth",
    fullyVerified: true,
    rating: 4.9,
    reviewCount: 173,
    nextSlot: "Tomorrow, 11:00 AM",
    services: [
      { name: "Interior Refresh", description: "Full vacuum, wipe-down, glass and a light deodorise.", durationMin: 75, price: 55 },
      { name: "Stain & Shampoo", description: "Seats and carpets shampooed and extracted. Stains targeted.", durationMin: 150, price: 110 },
      { name: "Pet Hair Removal", description: "Specialist de-hair, deep vac and odour neutralise.", durationMin: 90, price: 70 },
    ],
    reviews: [
      { author: "Hannah B.", rating: 5, date: "2026-06-14", text: "Two dogs and a toddler — they made it look brand new. Magicians." },
      { author: "Carl T.", rating: 5, date: "2026-06-01", text: "Coffee stain that had been there a year. Gone. Incredible." },
    ],
    gallery: [
      { label: "Fabric seats restored", before: "555259", after: "5e8b96" },
      { label: "Carpet extraction", before: "4a4750", after: "75a0aa" },
    ],
  },
  {
    slug: "apex-fleet-care",
    name: "Apex Fleet Care",
    tagline: "Vans & fleets, sorted",
    category: "Fleet",
    categories: ["Fleet", "Exterior wash"],
    about: "Keeping commercial vehicles presentable on the road. Scheduled fleet cleaning, one invoice.",
    area: "Stratford, London",
    distanceKm: 5.1,
    seed: "213c43",
    tier: "fleet",
    fullyVerified: true,
    rating: 4.8,
    reviewCount: 64,
    nextSlot: "Wed, 7:00 AM",
    services: [
      { name: "Single Van Wash", description: "Exterior wash for one van, livery-safe.", durationMin: 40, price: 40 },
      { name: "Van Valet", description: "Exterior wash plus cab interior clean and sanitise.", durationMin: 90, price: 75 },
      { name: "Fleet Contract (per vehicle)", description: "Scheduled recurring clean across your fleet, billed monthly.", durationMin: 40, price: 32 },
    ],
    reviews: [
      { author: "Nadia (Brightline Ltd)", rating: 5, date: "2026-06-09", text: "Eight vans, one invoice, zero hassle." },
      { author: "Greg M.", rating: 4, date: "2026-05-18", text: "Reliable and early. Cabs come up spotless." },
    ],
    gallery: [{ label: "Transit fleet", before: "4a4750", after: "4e7a85" }],
  },
  {
    slug: "hydro-hand-wash",
    name: "Hydro Hand Wash",
    tagline: "Water-wise, waterless options",
    category: "Exterior wash",
    categories: ["Exterior wash", "Mobile valet", "Wheels & tyres"],
    about: "Eco-conscious mobile washing using rinseless and waterless methods.",
    area: "Walthamstow, London",
    distanceKm: 4.3,
    seed: "93b5bd",
    tier: "solo",
    fullyVerified: false, // unverified — management tools only, no in-app payments, no marketplace badge
    rating: 4.6,
    reviewCount: 51,
    nextSlot: "Today, 6:30 PM",
    services: [
      { name: "Waterless Wash", description: "Rinseless exterior clean — ideal where there's no water supply.", durationMin: 40, price: 25 },
      { name: "Wash & Wax", description: "Waterless wash with a spray sealant for added gloss and protection.", durationMin: 60, price: 38 },
    ],
    reviews: [
      { author: "Olu A.", rating: 5, date: "2026-06-05", text: "Did my car in the underground car park — no water needed. Brilliant idea." },
      { author: "Bea N.", rating: 4, date: "2026-05-20", text: "Great for a flat with no outside tap. Lovely finish." },
    ],
    gallery: [{ label: "Waterless finish", before: "5b6b6f", after: "93b5bd" }],
  },
];

export async function seedDatabase(db: Db): Promise<void> {
  for (const p of SEED_PROVIDERS) {
    const ownerId = id("usr");
    const orgId = id("org");
    const priceFrom = Math.min(...p.services.map((s) => s.price));
    await db.tx(async (t) => {
      // Sandbox login: providers sign in with this email (OTP devCode returned in console mode).
      await t.run(`INSERT INTO users (id, name, email, phone, claimed, created_at) VALUES (?, ?, ?, ?, 1, ?)`, [
        ownerId,
        `${p.name} (owner)`,
        `${p.slug}@provider.fableplus`,
        `owner-${p.slug}`,
        now(),
      ]);
      await t.run(
        `INSERT INTO orgs (id, owner_user_id, name, slug, tagline, category, categories, about, area, distance_km, seed, tier, rating, review_count, price_from, next_slot, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orgId,
          ownerId,
          p.name,
          p.slug,
          p.tagline,
          p.category,
          JSON.stringify(p.categories),
          p.about,
          p.area,
          p.distanceKm,
          p.seed,
          p.tier,
          p.rating,
          p.reviewCount,
          priceFrom,
          p.nextSlot,
          now(),
        ],
      );
      for (const s of p.services) {
        await t.run(`INSERT INTO services (id, org_id, name, description, duration_min, price) VALUES (?, ?, ?, ?, ?, ?)`, [
          id("svc"),
          orgId,
          s.name,
          s.description,
          s.durationMin,
          s.price,
        ]);
      }
      for (const r of p.reviews) {
        await t.run(`INSERT INTO reviews (id, org_id, author, rating, text, date) VALUES (?, ?, ?, ?, ?, ?)`, [
          id("rev"),
          orgId,
          r.author,
          r.rating,
          r.text,
          r.date,
        ]);
      }
      for (const g of p.gallery) {
        await t.run(`INSERT INTO gallery (id, org_id, label, before, after) VALUES (?, ?, ?, ?, ?)`, [
          id("gal"),
          orgId,
          g.label,
          g.before,
          g.after,
        ]);
      }
    });

    // Showcase FW29: give one provider a custom (AA-compliant) storefront theme.
    if (p.slug === "gleamworks-detailing") {
      const theme: Record<string, string> = { "brand.primary": "#7A3E2B", "brand.onPrimary": "#FFFFFF", "brand.accent": "#9C5A3C" };
      for (const [k, v] of Object.entries(theme)) {
        await db.run(`INSERT INTO theme_tokens (org_id, key, value) VALUES (?, ?, ?) ON CONFLICT (org_id, key) DO UPDATE SET value = excluded.value`, [orgId, k, v]);
      }
    }

    // Complete the verification state machine for fully-verified providers.
    if (p.fullyVerified) {
      await runSandboxKyc(db, orgId, "passed");
      for (const step of ["asset_check", "hmrc_details", "payout_setup", "twofa"] as const) {
        await setStep(db, orgId, step, true);
      }
    }
  }
}

// run directly: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = await openDb();
  const existing = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM orgs`))!;
  if (Number(existing.n) > 0) {
    console.log(`DB already has ${existing.n} providers — skipping seed.`);
  } else {
    await seedDatabase(db);
    console.log(`Seeded ${SEED_PROVIDERS.length} providers (${db.dialect})`);
  }
  await db.close();
}
