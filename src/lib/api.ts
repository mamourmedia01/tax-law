// Typed client for the Fable+ API. Cookies (httpOnly session) travel automatically.

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "You appear to be offline. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string } }).error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? "Something went wrong");
  }
  return data as T;
}

// --- shapes -------------------------------------------------------------------
export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  claimed: boolean;
  marketingConsent: boolean;
  isAdmin: boolean;
}
export interface Service {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
}
export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
}
export interface Reveal {
  id: string;
  label: string;
  before: string;
  after: string;
}
export interface Provider {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  categories: string[];
  about: string;
  area: string;
  distanceKm: number;
  seed: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  priceFrom: number;
  nextSlot: string;
}
export interface ProviderDetail extends Provider {
  services: Service[];
  reviews: Review[];
  gallery: Reveal[];
  theme: Record<string, string>;
}
export type BookingStatus = "confirmed" | "completed" | "cancelled";
export interface Booking {
  id: string;
  ref: string;
  orgId: string;
  providerName: string;
  providerSlug: string;
  providerSeed: string;
  source: "marketplace_lead" | "byoc_client";
  date: string;
  time: string;
  durationMin: number;
  total: number;
  status: BookingStatus;
  payMethod: "in_app" | "cash";
  serviceNames: string[];
  createdAt: number;
}
export interface Slot {
  time: string;
  available: boolean;
}

export const api = {
  // auth
  me: () => req<{ user: User | null }>("GET", "/auth/me"),
  requestOtp: (identifier: string) => req<{ sent: boolean; devCode?: string }>("POST", "/auth/request-otp", { identifier }),
  verifyOtp: (identifier: string, code: string) => req<{ user: User }>("POST", "/auth/verify-otp", { identifier, code }),
  logout: () => req<{ ok: true }>("POST", "/auth/logout"),
  updateAccount: (patch: { name?: string; email?: string; phone?: string; marketing_consent?: boolean }) =>
    req<{ user: User }>("PATCH", "/account", patch),
  exportAccount: () => req<unknown>("GET", "/account/export"),
  deleteAccount: () => req<{ deleted: true }>("DELETE", "/account"),

  // catalog
  providers: (params: { q?: string; category?: string; verifiedOnly?: boolean; sort?: string }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.category) qs.set("category", params.category);
    if (params.verifiedOnly) qs.set("verifiedOnly", "true");
    if (params.sort) qs.set("sort", params.sort);
    return req<Provider[]>("GET", `/providers?${qs.toString()}`);
  },
  provider: (slug: string) => req<ProviderDetail>("GET", `/providers/${slug}`),
  availability: (slug: string, date: string) => req<Slot[]>("GET", `/providers/${slug}/availability?date=${date}`),

  // bookings
  createBooking: (input: { providerSlug: string; serviceIds: string[]; date: string; time: string }) =>
    req<Booking>("POST", "/bookings", input),
  bookings: () => req<Booking[]>("GET", "/bookings"),
  booking: (id: string) => req<Booking>("GET", `/bookings/${id}`),
  cancelBooking: (id: string) => req<Booking>("POST", `/bookings/${id}/cancel`),
  payBooking: (id: string, idempotencyKey: string) =>
    req<{ paymentId: string; status: string; applicationFee: number }>("POST", `/bookings/${id}/pay`, { idempotencyKey }),

  // notifications
  notifications: () => req<{ id: string; bucket: string; title: string; body: string; created_at: number }[]>("GET", "/notifications"),

  // provider control plane
  providerMe: () =>
    req<{
      org: { id: string; name: string; slug: string; tier: string; verified: boolean };
      entitlements: {
        tier: string;
        leads: { used: number; cap: number | null; remaining: number | null };
        clients: { used: number; cap: number | null; remaining: number | null };
        ai: { providerSuite: boolean; copilot: boolean; voice: boolean };
      };
      verification: Record<string, unknown>;
    }>("GET", "/provider/me"),
  providerBookings: () =>
    req<{ id: string; ref: string; source: string; date: string; time: string; total: number; status: string }[]>(
      "GET",
      "/provider/bookings",
    ),
  subscription: () =>
    req<{
      subscription: { tier: string; status: string; price: number; current_period_end: number | null } | null;
      catalog: { tier: string; label: string; price: number; leadsPerMonth: number | null; clientSlots: number | null; seats: number | null }[];
      current: string;
    }>("GET", "/provider/subscription"),
  setSubscription: (tier: string) => req<{ subscription: { tier: string; price: number; status: string } }>("POST", "/provider/subscription", { tier }),
  cancelSubscription: () => req<{ subscription: { status: string } }>("POST", "/provider/subscription/cancel"),
  copilot: () =>
    req<{
      grounded: boolean;
      model: string;
      generatedFrom: Record<string, number | null>;
      suggestions: { title: string; detail: string; reason: string; action: string }[];
    }>("GET", "/provider/copilot"),
};
