import { Errors, config } from "./lib.js";

// ---------------------------------------------------------------------------
// DVSA MOT History API integration.
//
// Flow: OAuth2 client-credentials against the Microsoft token URL (scope
// .../.default) → bearer token (cached until expiry) → GET the MOT history
// endpoint with `Authorization: Bearer` + `X-API-Key`.
//
// If credentials are absent (or the network is unavailable), a deterministic
// SANDBOX response keeps the feature working offline and in tests.
// ---------------------------------------------------------------------------

export interface VehicleMot {
  registration: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  fuelType: string | null;
  firstUsed: string | null;
  motStatus: "valid" | "expired" | "unknown";
  motExpiry: string | null;
  advisories: string[];
  source: "dvsa" | "sandbox";
}

const live = (): boolean =>
  !!(config.dvsa.clientId && config.dvsa.clientSecret && config.dvsa.apiKey && config.dvsa.tokenUrl);

// --- token cache ---
let token: { value: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.dvsa.clientId,
    client_secret: config.dvsa.clientSecret,
    scope: config.dvsa.scope,
  });
  const res = await fetch(config.dvsa.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`DVSA token ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return token.value;
}

function normalisePlate(reg: string): string {
  return reg.toUpperCase().replace(/\s+/g, "");
}

// Deterministic sandbox vehicle so the feature works without credentials/network.
function sandboxVehicle(reg: string): VehicleMot {
  let h = 0;
  for (const c of reg) h = (h * 31 + c.charCodeAt(0)) % 100000;
  const makes = ["Ford", "Volkswagen", "BMW", "Toyota", "Audi", "Vauxhall"];
  const models = ["Focus", "Golf", "3 Series", "Corolla", "A3", "Astra"];
  const colours = ["Blue", "Black", "Silver", "White", "Grey", "Red"];
  const fuels = ["Petrol", "Diesel", "Hybrid"];
  const valid = h % 4 !== 0;
  const d = new Date();
  d.setMonth(d.getMonth() + (valid ? 6 : -2));
  return {
    registration: reg,
    make: makes[h % makes.length],
    model: models[h % models.length],
    colour: colours[h % colours.length],
    fuelType: fuels[h % fuels.length],
    firstUsed: `${2014 + (h % 9)}-03-01`,
    motStatus: valid ? "valid" : "expired",
    motExpiry: d.toISOString().slice(0, 10),
    advisories: valid ? ["Nearside front tyre worn close to legal limit"] : ["MOT expired — book a test"],
    source: "sandbox",
  };
}

interface DvsaDefect {
  text?: string;
  type?: string; // ADVISORY | MINOR | MAJOR | DANGEROUS | FAIL | USER ENTERED
  dangerous?: boolean;
}
interface DvsaTest {
  completedDate?: string;
  testResult?: string; // PASSED | FAILED
  expiryDate?: string;
  odometerValue?: string;
  odometerUnit?: string;
  defects?: DvsaDefect[];
  rfrAndComments?: DvsaDefect[]; // older schema name for defects
}
interface DvsaVehicle {
  registration?: string;
  make?: string;
  model?: string;
  primaryColour?: string;
  colour?: string; // tolerate both
  fuelType?: string;
  firstUsedDate?: string;
  manufactureDate?: string;
  motTestDueDate?: string; // first-MOT-due date for vehicles with no tests yet
  motTests?: DvsaTest[];
}

// DVSA returns dates as "yyyy.MM.dd HH:mm:ss" (older) or "yyyy-MM-dd[ HH:mm:ss]"
// (newer). Parse tolerantly to an epoch; returns NaN if unparseable.
function parseDvsaDate(s: string | undefined | null): number {
  if (!s) return NaN;
  const iso = s.trim().replace(/\./g, "-").replace(" ", "T");
  return new Date(iso).getTime();
}

const ADVISORY_TYPES = new Set(["ADVISORY", "MINOR", "USER ENTERED"]);

// Pure, unit-testable mapping from a raw DVSA vehicle record to our shape.
export function mapDvsaResponse(reg: string, v: DvsaVehicle): VehicleMot {
  const tests = Array.isArray(v.motTests) ? v.motTests : [];
  // newest test by completedDate (fall back to original order when dates missing)
  const latest = [...tests].sort((a, b) => {
    const ta = parseDvsaDate(a.completedDate);
    const tb = parseDvsaDate(b.completedDate);
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return tb - ta;
  })[0];

  const expiry = latest?.expiryDate ?? null;
  let motStatus: VehicleMot["motStatus"];
  if (expiry) {
    motStatus = parseDvsaDate(expiry) >= Date.now() ? "valid" : "expired";
  } else if (latest?.testResult) {
    motStatus = latest.testResult.toUpperCase() === "PASSED" ? "valid" : "expired";
  } else {
    motStatus = "unknown"; // no tests yet (e.g. new vehicle with a motTestDueDate)
  }

  const defects = latest?.defects ?? latest?.rfrAndComments ?? [];
  // advisories first (the customer-relevant "keep an eye on" items), then any others
  const advisories = [
    ...defects.filter((d) => d.type && ADVISORY_TYPES.has(d.type.toUpperCase())),
    ...defects.filter((d) => !d.type || !ADVISORY_TYPES.has(d.type.toUpperCase())),
  ]
    .map((d) => d.text?.trim() ?? "")
    .filter(Boolean)
    .slice(0, 5);

  return {
    registration: v.registration ? normalisePlate(v.registration) : reg,
    make: v.make ?? null,
    model: v.model ?? null,
    colour: v.primaryColour ?? v.colour ?? null,
    fuelType: v.fuelType ?? null,
    firstUsed: v.firstUsedDate ?? v.manufactureDate ?? null,
    motStatus,
    motExpiry: expiry,
    advisories,
    source: "dvsa",
  };
}

export async function lookupVehicle(registration: string): Promise<VehicleMot> {
  const reg = normalisePlate(registration);
  if (!/^[A-Z0-9]{2,8}$/.test(reg)) throw Errors.badRequest("Enter a valid UK registration");
  if (!live()) return sandboxVehicle(reg);

  try {
    const accessToken = await getAccessToken();
    const res = await fetch(`${config.dvsa.apiBase}/${encodeURIComponent(reg)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "X-API-Key": config.dvsa.apiKey, Accept: "application/json" },
    });
    if (res.status === 404) throw Errors.notFound("No vehicle found for that registration");
    if (!res.ok) throw new Error(`DVSA ${res.status}`);
    const raw = (await res.json()) as DvsaVehicle | DvsaVehicle[];
    // The endpoint returns a single object; tolerate an array form defensively.
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (!v) throw Errors.notFound("No vehicle found for that registration");
    return mapDvsaResponse(reg, v);
  } catch (e) {
    // graceful: a transient DVSA/network failure falls back to sandbox rather than 500ing
    if ((e as { status?: number }).status === 404) throw e;
    return sandboxVehicle(reg);
  }
}
