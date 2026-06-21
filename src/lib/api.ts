// Typed client for the Fable+ API.
// Web: same-origin, httpOnly session cookie. Native (Capacitor): absolute API base
// (API_BASE) + bearer token in the Authorization header.

import { API_BASE, getToken, setToken } from "./native";

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
  const headers: Record<string, string> = {};
  if (body) headers["content-type"] = "application/json";
  const token = getToken();
  if (token) headers["authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      credentials: "include",
      headers,
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
  vertical: string;
  lat: number;
  lng: number;
}
export interface Package {
  id: string;
  name: string;
  description: string;
  price: number;
  credits: number;
}
export interface Membership {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
}
export interface ProviderDetail extends Provider {
  services: Service[];
  reviews: Review[];
  gallery: Reveal[];
  packages: Package[];
  memberships: Membership[];
  marketplaceFull: boolean;
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
  vehicleReg: string | null;
  vehicleDesc: string | null;
  creditApplied: number;
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
  verifyOtp: async (identifier: string, code: string) => {
    const r = await req<{ user: User; token?: string }>("POST", "/auth/verify-otp", { identifier, code });
    if (r.token) await setToken(r.token); // native bearer token; web ignores (uses cookie)
    return r;
  },
  logout: async () => {
    const r = await req<{ ok: true }>("POST", "/auth/logout");
    await setToken(null);
    return r;
  },
  updateAccount: (patch: { name?: string; email?: string; phone?: string; marketing_consent?: boolean }) =>
    req<{ user: User }>("PATCH", "/account", patch),
  // customer saved location (for provider service-radius enforcement)
  getLocation: () => req<{ postcode: string | null; lat: number | null; lng: number | null }>("GET", "/account/location"),
  setLocation: (postcode: string) =>
    req<{ postcode: string; lat: number; lng: number; source: "postcodes_io" | "sandbox" }>("POST", "/account/location", { postcode }),
  exportAccount: () => req<unknown>("GET", "/account/export"),
  deleteAccount: async () => {
    const r = await req<{ deleted: true }>("DELETE", "/account");
    await setToken(null);
    return r;
  },

  // My Garage
  garage: () => req<{ id: string; reg: string; make: string | null; model: string | null; colour: string | null; motStatus: string | null; motExpiry: string | null }[]>("GET", "/garage"),
  addVehicle: (reg: string) => req<{ id: string; reg: string; make: string | null; model: string | null }>("POST", "/garage", { reg }),
  removeVehicle: (id: string) => req<{ deleted: true }>("DELETE", `/garage/${id}`),
  // reviews + wallet at checkout + provider status
  reviewBooking: (id: string, rating: number, text: string) => req<{ reviewed: true }>("POST", `/bookings/${id}/review`, { rating, text }),
  applyCredit: (id: string) => req<{ applied: number; payable: number }>("POST", `/bookings/${id}/apply-credit`),
  setBookingStatus: (id: string, status: "completed" | "no_show" | "cancelled") => req<{ status: string }>("POST", `/provider/bookings/${id}/status`, { status }),

  // DVSA vehicle / MOT lookup
  vehicle: (reg: string) =>
    req<{
      registration: string;
      make: string | null;
      model: string | null;
      colour: string | null;
      fuelType: string | null;
      motStatus: "valid" | "expired" | "unknown";
      motExpiry: string | null;
      advisories: string[];
      source: string;
    }>("GET", `/vehicles/${encodeURIComponent(reg)}`),

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
  createBooking: (input: { providerSlug: string; serviceIds: string[]; date: string; time: string; vehicleReg?: string; vehicleDesc?: string; recurrence?: { interval: 1 | 2; count: number } }) =>
    req<Booking & { recurringCreated?: number }>("POST", "/bookings", input),
  connectProvider: (slug: string) => req<{ linked: true }>("POST", `/providers/${slug}/connect`),
  team: () => req<{ id: string; name: string; contact: string; role: string }[]>("GET", "/provider/team"),
  inviteTeam: (name: string, contact: string) => req<{ id: string }>("POST", "/provider/team", { name, contact }),
  removeTeam: (id: string) => req<{ deleted: true }>("DELETE", `/provider/team/${id}`),
  getHmrc: () => req<{ legalName: string; taxId: string; address: string } | null>("GET", "/provider/hmrc"),
  saveHmrc: (input: { legalName: string; taxId: string; address: string }) => req<{ saved: true }>("POST", "/provider/hmrc", input),
  // UK bank / payout details. Returns the masked display form; raw details are never read back.
  getBankDetails: () =>
    req<{ accountHolderName: string; sortCodeMasked: string; accountNumberMasked: string; updatedAt: number } | null>(
      "GET",
      "/provider/payout/bank",
    ),
  saveBankDetails: (input: { accountHolderName: string; sortCode: string; accountNumber: string }) =>
    req<{ accountHolderName: string; sortCodeMasked: string; accountNumberMasked: string; updatedAt: number }>(
      "POST",
      "/provider/payout/bank",
      input,
    ),
  bookings: () => req<Booking[]>("GET", "/bookings"),
  booking: (id: string) => req<Booking>("GET", `/bookings/${id}`),
  cancelBooking: (id: string) => req<Booking>("POST", `/bookings/${id}/cancel`),
  payBooking: (id: string, idempotencyKey: string) =>
    req<{ paymentId: string; status: string; applicationFee: number }>("POST", `/bookings/${id}/pay`, { idempotencyKey }),

  // notifications
  notifications: () =>
    req<{ id: string; bucket: string; title: string; body: string; delivered_via: string | null; created_at: number }[]>(
      "GET",
      "/notifications",
    ),

  // FW31 concierge
  concierge: (message: string) =>
    req<{
      reply: string;
      intent: string;
      references: { type: string; label: string; href: string }[];
      grounded: boolean;
      model: string;
    }>("POST", "/concierge", { message }),

  // Wave 5: referrals, seasonal, B2B
  referral: () => req<{ code: string; referrals: number; creditPerReferral: number }>("GET", "/account/referral"),
  applyReferral: (code: string) => req<{ credited: number }>("POST", "/referrals/apply", { code }),
  seasonal: () =>
    req<{ campaign: { id: string; title: string; blurb: string; pushCategories: string[] }; featured: Provider[] }>("GET", "/seasonal"),
  b2bEnquiry: (input: { name: string; email: string; company?: string; fleetSize?: number; message?: string }) =>
    req<{ received: boolean }>("POST", "/b2b/enquiry", input),

  // FW30 commerce
  purchasePackage: (id: string) => req<{ credits_remaining: number }>("POST", `/packages/${id}/purchase`),
  myPackages: () => req<{ id: string; credits_remaining: number; name: string; provider: string; slug: string }[]>("GET", "/me/packages"),
  joinMembership: (id: string) => req<{ id: string; status: string }>("POST", `/memberships/${id}/join`),
  wallet: () => req<{ balance: number }>("GET", "/account/wallet"),
  issueGiftCard: (amount: number) => req<{ code: string; amount: number; balance: number }>("POST", "/giftcards", { amount }),
  redeemGiftCard: (code: string) => req<{ credited: number }>("POST", "/giftcards/redeem", { code }),
  // FW30 provider commerce + KYC
  createPackage: (input: { name: string; price: number; credits: number; description?: string }) => req("POST", "/provider/packages", input),
  createMembership: (input: { name: string; monthlyPrice: number; description?: string }) => req("POST", "/provider/memberships", input),
  submitKyc: (docType: string) => req<{ documentId: string; kycStatus: string }>("POST", "/provider/verify/kyc/document", { docType }),
  passKyc: () => req<{ verified: boolean }>("POST", "/provider/verify/kyc", { outcome: "passed" }),
  setVerStep: (step: string, value: boolean) => req<{ verified: boolean }>("POST", "/provider/verify/step", { step, value }),

  // FW33 provider nudge settings
  setProviderSettings: (rebookNudges: boolean) =>
    req<{ ok: true; rebookNudges: boolean }>("PATCH", "/provider/settings", { rebookNudges }),
  runNudges: () => req<{ sent: number; suppressed: number; providerOptIn: boolean }>("POST", "/provider/nudges/run"),

  // provider service radius + per-client extended-radius overrides
  setServiceRadius: (radiusKm: number) => req<{ radiusKm: number }>("POST", "/provider/radius", { radiusKm }),
  setClientRadius: (customerId: string, radiusKm: number) =>
    req<{ customerUserId: string; radiusKm: number }>("POST", `/provider/clients/${customerId}/radius`, { radiusKm }),
  removeClientRadius: (customerId: string) => req<{ removed: boolean }>("DELETE", `/provider/clients/${customerId}/radius`),

  // provider control plane
  providerMe: () =>
    req<{
      org: { id: string; name: string; slug: string; tier: string; verified: boolean; rebookNudges: boolean; serviceRadiusKm: number };
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
