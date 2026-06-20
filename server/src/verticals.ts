// Vertical-agnostic core (FW26 invariant I1).
//
// The booking / payments / tenancy core knows NOTHING about car care. Everything
// vertical-specific (categories, copy, taxonomy) lives in these config objects. Adding
// a vertical is data, not a core change — proving the platform is "built once to expand".
//
// IMPORTANT: core modules (bookings, payments, auth, entitlements, database) must NOT
// import from here. Only edge/presentation layers resolve a vertical's config.

export interface VerticalConfig {
  id: string;
  label: string;
  categories: string[];
  // copy used by edge layers (seasonal engine, concierge, share cards)
  unitNoun: string; // "vehicle", "home"
  ctaVerb: string; // "Book a wash", "Book a clean"
}

export const VERTICALS: Record<string, VerticalConfig> = {
  "car-care": {
    id: "car-care",
    label: "Mobile car care",
    categories: ["Mobile valet", "Exterior wash", "Interior detail", "Ceramic coating", "Wheels & tyres", "Fleet"],
    unitNoun: "vehicle",
    ctaVerb: "Book a wash",
  },
  // Proof of expansion: a second vertical defined entirely as config (no core changes).
  "home-cleaning": {
    id: "home-cleaning",
    label: "Home cleaning",
    categories: ["Regular clean", "Deep clean", "End of tenancy", "Carpets", "Windows", "Commercial"],
    unitNoun: "home",
    ctaVerb: "Book a clean",
  },
};

export function getVertical(id: string): VerticalConfig {
  return VERTICALS[id] ?? VERTICALS["car-care"];
}

export const DEFAULT_VERTICAL = "car-care";
