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

interface DvsaTest {
  completedDate?: string;
  testResult?: string;
  expiryDate?: string;
  defects?: { text?: string; type?: string }[];
}
interface DvsaVehicle {
  make?: string;
  model?: string;
  primaryColour?: string;
  fuelType?: string;
  firstUsedDate?: string;
  motTests?: DvsaTest[];
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
    const v = (await res.json()) as DvsaVehicle;
    const latest = (v.motTests ?? []).sort((a, b) => (b.completedDate ?? "").localeCompare(a.completedDate ?? ""))[0];
    const expiry = latest?.expiryDate ?? null;
    const motStatus: VehicleMot["motStatus"] = expiry
      ? new Date(expiry) >= new Date()
        ? "valid"
        : "expired"
      : "unknown";
    return {
      registration: reg,
      make: v.make ?? null,
      model: v.model ?? null,
      colour: v.primaryColour ?? null,
      fuelType: v.fuelType ?? null,
      firstUsed: v.firstUsedDate ?? null,
      motStatus,
      motExpiry: expiry,
      advisories: (latest?.defects ?? []).map((d) => d.text ?? "").filter(Boolean).slice(0, 5),
      source: "dvsa",
    };
  } catch (e) {
    // graceful: a transient DVSA/network failure falls back to sandbox rather than 500ing
    if ((e as { status?: number }).status === 404) throw e;
    return sandboxVehicle(reg);
  }
}
