import { Errors, config } from "./lib.js";

// ---------------------------------------------------------------------------
// Geo module: UK postcode validation/correction + geocoding + distance.
//
// validateUkPostcode  — normalise to canonical "AA1 1AA" form and validate; on
//                       failure throw a specific, correctable bad-request message.
// geocodePostcode     — resolve a postcode to {lat,lng} via postcodes.io (free,
//                       no API key) with a short timeout; on network/timeout/
//                       unknown failure fall back to a DETERMINISTIC sandbox
//                       geocode so the feature works offline and in tests.
// haversineKm         — great-circle distance in km between two {lat,lng}.
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}

export type GeocodeSource = "postcodes_io" | "sandbox";

export interface GeocodeResult extends LatLng {
  postcode: string;
  source: GeocodeSource;
}

// UK postcode regex (covers the standard outward+inward forms incl. the
// special "GIR 0AA"). Applied to the SPACE-STRIPPED, upper-cased string so the
// single canonical space is re-inserted by us, not relied upon from input.
const UK_POSTCODE = /^(GIR0AA|[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2})$/;

/**
 * Normalise a raw postcode to the canonical "AA1 1AA" form: upper-cased, all
 * internal whitespace removed, then a single space inserted before the 3-char
 * inward code. Throws a specific, correctable Errors.badRequest on failure.
 */
export function validateUkPostcode(raw: string): string {
  const compact = String(raw ?? "").toUpperCase().replace(/\s+/g, "");
  if (!compact) throw Errors.badRequest("Please enter your postcode.");
  if (!UK_POSTCODE.test(compact)) {
    throw Errors.badRequest("That doesn't look like a UK postcode — try a format like 'SW1A 1AA'.");
  }
  // The inward code is always the last 3 characters; the rest is the outward code.
  const outward = compact.slice(0, -3);
  const inward = compact.slice(-3);
  return `${outward} ${inward}`;
}

// Deterministic sandbox geocode: hash the (canonical) postcode to stable
// coordinates clustered near central London. Keeps geocoding working offline
// and in tests, and is identical run-to-run for a given postcode.
export function sandboxGeocode(postcode: string): GeocodeResult {
  let h = 0;
  for (const c of postcode.replace(/\s+/g, "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // spread roughly within ~±0.25° of London (≈ ±18–28 km)
  const lat = 51.5074 + ((h % 1000) - 500) / 2000;
  const lng = -0.1278 + ((Math.floor(h / 1000) % 1000) - 500) / 2000;
  return { postcode, lat, lng, source: "sandbox" };
}

interface PostcodesIoResponse {
  status: number;
  result?: { postcode?: string; latitude?: number; longitude?: number } | null;
}

/**
 * Geocode a postcode. Validates+normalises first, then tries postcodes.io with a
 * short timeout. On a definitive "postcode does not exist" (HTTP 404) we surface
 * a correctable error so the customer can re-check it. On any other failure
 * (network, timeout, malformed response) we fall back to the sandbox geocode.
 */
export async function geocodePostcode(raw: string): Promise<GeocodeResult> {
  const postcode = validateUkPostcode(raw);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.geocode.timeoutMs);
  try {
    const url = `${config.geocode.baseUrl}/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`;
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (res.status === 404) {
      // Definitive "not found" — this is the identify-and-rectify path.
      throw Errors.badRequest("We couldn't find that postcode — please check and re-enter.");
    }
    if (!res.ok) throw new Error(`postcodes.io ${res.status}`);
    const data = (await res.json()) as PostcodesIoResponse;
    const r = data.result;
    if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") {
      throw new Error("postcodes.io malformed");
    }
    return { postcode, lat: r.latitude, lng: r.longitude, source: "postcodes_io" };
  } catch (e) {
    // A correctable bad-request (e.g. the 404 above) must propagate to the user.
    if ((e as { status?: number }).status === 400) throw e;
    // Anything else (offline/timeout/transient) gracefully falls back to sandbox.
    return sandboxGeocode(postcode);
  } finally {
    clearTimeout(timer);
  }
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km between two {lat,lng} points. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
