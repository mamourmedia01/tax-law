import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

// True when running inside the Capacitor native shell (iOS/Android), false on the web.
export const isNative = Capacitor.isNativePlatform();

// Absolute API base. On native there is no Vite proxy / same-origin, so the app must
// call an absolute URL (set VITE_API_URL at build time). On web it stays relative.
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const TOKEN_KEY = "fp_token";
let cachedToken: string | null = null;

// On native we authenticate with a bearer token kept in secure-ish Preferences
// (cookies are awkward cross-origin in a WebView). On web we rely on the httpOnly cookie.
export async function loadToken(): Promise<void> {
  if (!isNative) return;
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  cachedToken = value ?? null;
}
export function getToken(): string | null {
  return cachedToken;
}
export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (!isNative) return;
  if (token) await Preferences.set({ key: TOKEN_KEY, value: token });
  else await Preferences.remove({ key: TOKEN_KEY });
}
