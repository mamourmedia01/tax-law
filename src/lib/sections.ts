// Per-section colour coordination.
//
// Each major area of the app maps to one accent so you can tell at a glance where
// you are: the bottom-nav active tab, a thin colour strip at the top of the screen,
// and section header icon tints all use the same hue. Class strings are written out
// in full (not interpolated) so Tailwind's JIT compiler keeps them.

export type SectionKey =
  | "home"
  | "search"
  | "bookings"
  | "profile"
  | "dashboard"
  | "garage"
  | "concierge";

export interface Section {
  key: SectionKey;
  label: string;
  /** thin bar at the very top of the screen */
  strip: string;
  /** active bottom-nav pill: background + icon colour */
  navActivePill: string;
  /** active bottom-nav label colour */
  navActiveLabel: string;
  /** soft tint used behind section header icons / chips */
  tintBg: string;
  /** matching text colour for the tint */
  tintText: string;
  /** border colour for the sticky header underline */
  border: string;
}

export const SECTIONS: Record<SectionKey, Section> = {
  home: {
    key: "home",
    label: "Home",
    strip: "bg-teal-500",
    navActivePill: "bg-teal-100 text-teal-700",
    navActiveLabel: "text-teal-800",
    tintBg: "bg-teal-100",
    tintText: "text-teal-700",
    border: "border-teal-500",
  },
  search: {
    key: "search",
    label: "Search",
    strip: "bg-sky-600",
    navActivePill: "bg-sky-100 text-sky-700",
    navActiveLabel: "text-sky-800",
    tintBg: "bg-sky-100",
    tintText: "text-sky-700",
    border: "border-sky-600",
  },
  bookings: {
    key: "bookings",
    label: "Bookings",
    strip: "bg-amber-600",
    navActivePill: "bg-amber-100 text-amber-700",
    navActiveLabel: "text-amber-800",
    tintBg: "bg-amber-100",
    tintText: "text-amber-700",
    border: "border-amber-600",
  },
  profile: {
    key: "profile",
    label: "Profile",
    strip: "bg-plum-600",
    navActivePill: "bg-plum-100 text-plum-700",
    navActiveLabel: "text-plum-800",
    tintBg: "bg-plum-100",
    tintText: "text-plum-700",
    border: "border-plum-600",
  },
  dashboard: {
    key: "dashboard",
    label: "Business",
    strip: "bg-emerald-600",
    navActivePill: "bg-emerald-100 text-emerald-700",
    navActiveLabel: "text-emerald-800",
    tintBg: "bg-emerald-100",
    tintText: "text-emerald-700",
    border: "border-emerald-600",
  },
  garage: {
    key: "garage",
    label: "Garage",
    strip: "bg-slate-600",
    navActivePill: "bg-slate-100 text-slate-700",
    navActiveLabel: "text-slate-800",
    tintBg: "bg-slate-100",
    tintText: "text-slate-700",
    border: "border-slate-600",
  },
  concierge: {
    key: "concierge",
    label: "Concierge",
    strip: "bg-teal-700",
    navActivePill: "bg-teal-100 text-teal-700",
    navActiveLabel: "text-teal-800",
    tintBg: "bg-teal-100",
    tintText: "text-teal-700",
    border: "border-teal-700",
  },
};

/** Resolve a route path to its section. */
export function sectionForPath(pathname: string): Section {
  const p = pathname.toLowerCase();
  if (p === "/" ) return SECTIONS.home;
  if (p.startsWith("/search")) return SECTIONS.search;
  if (p.startsWith("/bookings") || p.startsWith("/booking/") || p.startsWith("/notifications")) return SECTIONS.bookings;
  if (p.startsWith("/profile")) return SECTIONS.profile;
  if (p.startsWith("/dashboard") || p.startsWith("/business")) return SECTIONS.dashboard;
  if (p.startsWith("/garage") || p.startsWith("/vehicle")) return SECTIONS.garage;
  if (p.startsWith("/concierge") || p.startsWith("/voice")) return SECTIONS.concierge;
  // provider storefront, booking flow, content pages → brand teal
  return SECTIONS.home;
}
