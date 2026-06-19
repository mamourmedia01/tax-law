import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Booking } from "../types";

interface UserProfile {
  name: string;
  phone: string;
  email: string;
  claimed: boolean; // guest until they "claim" the account
}

interface Store {
  bookings: Booking[];
  addBooking: (b: Booking) => void;
  cancelBooking: (id: string) => void;
  user: UserProfile;
  setUser: (u: UserProfile) => void;
  favourites: string[]; // provider ids
  toggleFavourite: (id: string) => void;
}

const KEY = "fableplus.v1";

interface Persisted {
  bookings: Booking[];
  user: UserProfile;
  favourites: string[];
}

const DEFAULT: Persisted = {
  bookings: [],
  user: { name: "", phone: "", email: "", claimed: false },
  favourites: [],
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Persisted) };
  } catch {
    return DEFAULT;
  }
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<Store>(
    () => ({
      bookings: state.bookings,
      user: state.user,
      favourites: state.favourites,
      addBooking: (b) => setState((s) => ({ ...s, bookings: [b, ...s.bookings] })),
      cancelBooking: (id) =>
        setState((s) => ({
          ...s,
          bookings: s.bookings.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
        })),
      setUser: (u) => setState((s) => ({ ...s, user: u })),
      toggleFavourite: (id) =>
        setState((s) => ({
          ...s,
          favourites: s.favourites.includes(id)
            ? s.favourites.filter((f) => f !== id)
            : [...s.favourites, id],
        })),
    }),
    [state],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
