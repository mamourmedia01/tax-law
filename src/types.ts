export type Category =
  | "Mobile valet"
  | "Exterior wash"
  | "Interior detail"
  | "Ceramic coating"
  | "Wheels & tyres"
  | "Fleet";

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
  date: string;
  text: string;
}

export interface Reveal {
  id: string;
  label: string;
  before: string; // colour seed
  after: string; // colour seed
}

export interface Provider {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: Category;
  categories: Category[];
  rating: number;
  reviewCount: number;
  priceFrom: number;
  area: string;
  distanceKm: number;
  verified: boolean;
  seed: string; // colour seed for hero imagery
  about: string;
  nextSlot: string;
  services: Service[];
  reviews: Review[];
  gallery: Reveal[];
}

export type BookingStatus = "confirmed" | "completed" | "cancelled";

export interface Booking {
  id: string;
  ref: string;
  providerId: string;
  providerSlug: string;
  providerName: string;
  providerSeed: string;
  serviceIds: string[];
  serviceNames: string[];
  date: string; // ISO date (yyyy-mm-dd)
  time: string; // HH:mm
  durationMin: number;
  total: number;
  status: BookingStatus;
  customer: { name: string; phone: string; email: string };
  createdAt: number;
}
