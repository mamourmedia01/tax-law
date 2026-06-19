import type { Category, Provider } from "../types";

export const CATEGORIES: { label: Category; emoji: string }[] = [
  { label: "Mobile valet", emoji: "🚿" },
  { label: "Exterior wash", emoji: "✨" },
  { label: "Interior detail", emoji: "🧽" },
  { label: "Ceramic coating", emoji: "🛡️" },
  { label: "Wheels & tyres", emoji: "🛞" },
  { label: "Fleet", emoji: "🚐" },
];

export const PROVIDERS: Provider[] = [
  {
    id: "p1",
    slug: "jamies-mobile-valet",
    name: "Jamie's Mobile Valet",
    tagline: "Showroom shine at your door",
    category: "Mobile valet",
    categories: ["Mobile valet", "Interior detail", "Exterior wash"],
    rating: 4.9,
    reviewCount: 218,
    priceFrom: 35,
    area: "Hackney, London",
    distanceKm: 1.2,
    verified: true,
    seed: "1a6f78",
    about:
      "Family-run mobile valeting covering East London. We bring the water, the power and the polish — you just hand over the keys. Eco-friendly products, fully insured, and a finish we guarantee.",
    nextSlot: "Today, 2:00 PM",
    services: [
      { id: "p1s1", name: "Express Wash & Go", description: "Exterior hand wash, wheels, windows and a quick tyre dress.", durationMin: 45, price: 35 },
      { id: "p1s2", name: "Full Valet", description: "Inside-out clean: exterior wash, interior vac, dashboard, glass and mats.", durationMin: 120, price: 75 },
      { id: "p1s3", name: "Interior Deep Clean", description: "Seats, carpets and trim shampooed, steam-cleaned and protected.", durationMin: 150, price: 95 },
      { id: "p1s4", name: "Wax & Protect", description: "Hand wash plus a hard carnauba wax for a deep, lasting gloss.", durationMin: 90, price: 60 },
    ],
    reviews: [
      { id: "r1", author: "Priya S.", rating: 5, date: "2026-06-10", text: "Car came up like new. Jamie was bang on time and so easy to deal with." },
      { id: "r2", author: "Tom W.", rating: 5, date: "2026-06-04", text: "Booked the full valet — genuinely the cleanest it's been since I bought it." },
      { id: "r3", author: "Aisha K.", rating: 4, date: "2026-05-28", text: "Great job on the interior. A few minutes late but messaged ahead." },
    ],
    gallery: [
      { id: "g1", label: "Saloon · full valet", before: "5b6b6f", after: "2bb3c9" },
      { id: "g2", label: "Alloy refresh", before: "55525a", after: "8fb9c4" },
    ],
  },
  {
    id: "p2",
    slug: "gleamworks-detailing",
    name: "GleamWorks Detailing",
    tagline: "Detailing obsessives",
    category: "Ceramic coating",
    categories: ["Ceramic coating", "Exterior wash", "Interior detail"],
    rating: 4.8,
    reviewCount: 142,
    priceFrom: 49,
    area: "Islington, London",
    distanceKm: 2.7,
    verified: true,
    seed: "2e535c",
    about:
      "Specialist paint correction and ceramic coatings. We treat every car like a concours entry — multi-stage decontamination, machine polishing and coatings that last years, not weeks.",
    nextSlot: "Tomorrow, 9:30 AM",
    services: [
      { id: "p2s1", name: "Maintenance Wash", description: "Safe two-bucket wash to keep a coated car looking its best.", durationMin: 60, price: 49 },
      { id: "p2s2", name: "Enhancement Polish", description: "Single-stage machine polish to lift gloss and remove light swirls.", durationMin: 180, price: 180 },
      { id: "p2s3", name: "Ceramic Coating 3yr", description: "Full prep, paint correction and a 3-year ceramic coating.", durationMin: 360, price: 450 },
    ],
    reviews: [
      { id: "r4", author: "Marcus D.", rating: 5, date: "2026-06-12", text: "The ceramic coating is unreal. Water just sheets off it now." },
      { id: "r5", author: "Lena P.", rating: 5, date: "2026-05-30", text: "Worth every penny. The paint looks deeper than when it was new." },
    ],
    gallery: [
      { id: "g3", label: "Black paint correction", before: "3a3f42", after: "1a6f78" },
      { id: "g4", label: "Ceramic gloss", before: "5b6b6f", after: "29a3bf" },
    ],
  },
  {
    id: "p3",
    slug: "sparkle-on-wheels",
    name: "Sparkle On Wheels",
    tagline: "Quick, friendly, affordable",
    category: "Exterior wash",
    categories: ["Exterior wash", "Wheels & tyres"],
    rating: 4.7,
    reviewCount: 96,
    priceFrom: 20,
    area: "Camden, London",
    distanceKm: 3.4,
    verified: true,
    seed: "759ea8",
    about:
      "Friendly local washers doing honest work at honest prices. Perfect for a regular weekly tidy-up — we'll keep your car looking sharp without the showroom price tag.",
    nextSlot: "Today, 5:15 PM",
    services: [
      { id: "p3s1", name: "Mini Wash", description: "Quick exterior rinse, shampoo and dry. In and out.", durationMin: 30, price: 20 },
      { id: "p3s2", name: "Wash & Wheels", description: "Exterior wash plus a proper wheel and tyre clean.", durationMin: 45, price: 30 },
      { id: "p3s3", name: "Weekly Plan Wash", description: "Your standard wash, booked as a recurring weekly slot.", durationMin: 30, price: 18 },
    ],
    reviews: [
      { id: "r6", author: "Dev R.", rating: 5, date: "2026-06-08", text: "Cheap and cheerful, but they don't cut corners. Booked them weekly now." },
      { id: "r7", author: "Sophie L.", rating: 4, date: "2026-05-22", text: "Good value. Turned up with everything they needed." },
    ],
    gallery: [{ id: "g5", label: "City runabout", before: "57606a", after: "7fb0bd" }],
  },
  {
    id: "p4",
    slug: "interior-revival-co",
    name: "Interior Revival Co.",
    tagline: "We rescue tired interiors",
    category: "Interior detail",
    categories: ["Interior detail", "Mobile valet"],
    rating: 4.9,
    reviewCount: 173,
    priceFrom: 55,
    area: "Shoreditch, London",
    distanceKm: 1.9,
    verified: true,
    seed: "4e7a85",
    about:
      "Interiors are all we do. Pet hair, coffee spills, kids, mud — bring us your worst. Hot-water extraction, ozone deodorising and leather care that brings cabins back to life.",
    nextSlot: "Tomorrow, 11:00 AM",
    services: [
      { id: "p4s1", name: "Interior Refresh", description: "Full vacuum, wipe-down, glass and a light deodorise.", durationMin: 75, price: 55 },
      { id: "p4s2", name: "Stain & Shampoo", description: "Seats and carpets shampooed and extracted. Stains targeted.", durationMin: 150, price: 110 },
      { id: "p4s3", name: "Pet Hair Removal", description: "Specialist de-hair, deep vac and odour neutralise.", durationMin: 90, price: 70 },
    ],
    reviews: [
      { id: "r8", author: "Hannah B.", rating: 5, date: "2026-06-14", text: "Two dogs and a toddler — they made it look brand new. Magicians." },
      { id: "r9", author: "Carl T.", rating: 5, date: "2026-06-01", text: "Coffee stain that had been there a year. Gone. Incredible." },
    ],
    gallery: [
      { id: "g6", label: "Fabric seats restored", before: "555259", after: "5e8b96" },
      { id: "g7", label: "Carpet extraction", before: "4a4750", after: "75a0aa" },
    ],
  },
  {
    id: "p5",
    slug: "apex-fleet-care",
    name: "Apex Fleet Care",
    tagline: "Vans & fleets, sorted",
    category: "Fleet",
    categories: ["Fleet", "Exterior wash"],
    rating: 4.8,
    reviewCount: 64,
    priceFrom: 40,
    area: "Stratford, London",
    distanceKm: 5.1,
    verified: true,
    seed: "213c43",
    about:
      "Keeping commercial vehicles presentable on the road. Scheduled fleet cleaning, livery-safe products and one invoice for the whole fleet. We come to your depot, out of hours if needed.",
    nextSlot: "Wed, 7:00 AM",
    services: [
      { id: "p5s1", name: "Single Van Wash", description: "Exterior wash for one van, livery-safe.", durationMin: 40, price: 40 },
      { id: "p5s2", name: "Van Valet", description: "Exterior wash plus cab interior clean and sanitise.", durationMin: 90, price: 75 },
      { id: "p5s3", name: "Fleet Contract (per vehicle)", description: "Scheduled recurring clean across your fleet, billed monthly.", durationMin: 40, price: 32 },
    ],
    reviews: [
      { id: "r10", author: "Nadia (Brightline Ltd)", rating: 5, date: "2026-06-09", text: "Eight vans, one invoice, zero hassle. Exactly what we needed." },
      { id: "r11", author: "Greg M.", rating: 4, date: "2026-05-18", text: "Reliable and early. Cabs come up spotless." },
    ],
    gallery: [{ id: "g8", label: "Transit fleet", before: "4a4750", after: "4e7a85" }],
  },
  {
    id: "p6",
    slug: "hydro-hand-wash",
    name: "Hydro Hand Wash",
    tagline: "Water-wise, waterless options",
    category: "Exterior wash",
    categories: ["Exterior wash", "Mobile valet", "Wheels & tyres"],
    rating: 4.6,
    reviewCount: 51,
    priceFrom: 25,
    area: "Walthamstow, London",
    distanceKm: 4.3,
    verified: false,
    seed: "93b5bd",
    about:
      "Eco-conscious mobile washing using rinseless and waterless methods — perfect for flats and car parks with no tap access. Same shine, a fraction of the water.",
    nextSlot: "Today, 6:30 PM",
    services: [
      { id: "p6s1", name: "Waterless Wash", description: "Rinseless exterior clean — ideal where there's no water supply.", durationMin: 40, price: 25 },
      { id: "p6s2", name: "Wash & Wax", description: "Waterless wash with a spray sealant for added gloss and protection.", durationMin: 60, price: 38 },
    ],
    reviews: [
      { id: "r12", author: "Olu A.", rating: 5, date: "2026-06-05", text: "Did my car in the underground car park — no water needed. Brilliant idea." },
      { id: "r13", author: "Bea N.", rating: 4, date: "2026-05-20", text: "Great for a flat with no outside tap. Lovely finish." },
    ],
    gallery: [{ id: "g9", label: "Waterless finish", before: "5b6b6f", after: "93b5bd" }],
  },
];

export function getProvider(slug: string): Provider | undefined {
  return PROVIDERS.find((p) => p.slug === slug);
}

export function getServices(provider: Provider, ids: string[]) {
  return provider.services.filter((s) => ids.includes(s.id));
}
