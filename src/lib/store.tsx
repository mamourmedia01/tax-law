import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type User } from "./api";

interface Store {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  favourites: string[];
  toggleFavourite: (id: string) => void;
}

const FAV_KEY = "fableplus.favourites";

function loadFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
  } catch {
    return [];
  }
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [favourites, setFavourites] = useState<string[]>(loadFavs);

  async function refreshMe() {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    refreshMe().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(FAV_KEY, JSON.stringify(favourites));
  }, [favourites]);

  const value = useMemo<Store>(
    () => ({
      user,
      loading,
      setUser,
      refreshMe,
      logout: async () => {
        await api.logout().catch(() => {});
        setUser(null);
      },
      favourites,
      toggleFavourite: (id) =>
        setFavourites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])),
    }),
    [user, loading, favourites],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
