import type { Db } from "./database.js";
import { config } from "./lib.js";
import { audit } from "./audit.js";
import { availability } from "./bookings.js";

// ---------------------------------------------------------------------------
// FW32 Voice AI receptionist.
//
// TTS is delegated to a VibeVoice microservice (VOICE_SERVICE_URL); without it,
// a sandbox stub returns a placeholder tone so the pipeline runs here.
//
// Governance (enforced by construction):
//  - grounded: replies are built ONLY from the org's own services/availability.
//  - suggest-never-act (I25): the receptionist proposes a slot; it returns
//    `proposal` data — it NEVER creates a booking or moves money itself.
//  - never touches payments (this module has no payment import/call path, I28).
//  - tenant-scoped: every query is for the one org.
//  - audited: each interaction is logged (no sensitive payload).
// ---------------------------------------------------------------------------

export interface VoiceProvider {
  readonly mode: "sandbox" | "vibevoice";
  synthesize(text: string, speaker?: "agent" | "caller"): Promise<{ audioBase64: string; mode: string }>;
}

// Sandbox TTS — a tiny silent WAV header (44 bytes), enough to prove the path.
function silentWavBase64(): string {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(0, 40);
  return header.toString("base64");
}

class SandboxVoice implements VoiceProvider {
  readonly mode = "sandbox" as const;
  async synthesize(): Promise<{ audioBase64: string; mode: string }> {
    return { audioBase64: silentWavBase64(), mode: "sandbox" };
  }
}

class HttpVoice implements VoiceProvider {
  readonly mode = "vibevoice" as const;
  constructor(private url: string) {}
  async synthesize(text: string, speaker: "agent" | "caller" = "agent") {
    const res = await fetch(`${this.url}/synthesize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, speaker, base64: true }),
    });
    if (!res.ok) throw new Error(`voice service ${res.status}`);
    return (await res.json()) as { audioBase64: string; mode: string };
  }
}

export function makeVoice(): VoiceProvider {
  return config.voiceServiceUrl ? new HttpVoice(config.voiceServiceUrl) : new SandboxVoice();
}

// --- the grounded dialog planner -------------------------------------------
export interface ReceptionistTurn {
  reply: string;
  intent: "services" | "price" | "availability" | "booking_proposal" | "smalltalk";
  // suggest-never-act: a proposal a human must confirm — NOT a created booking
  proposal?: { serviceId: string; serviceName: string; price: number; date: string; time: string };
  audioBase64: string;
  voiceMode: string;
  grounded: true;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function receptionist(
  db: Db,
  voice: VoiceProvider,
  orgId: string,
  message: string,
): Promise<ReceptionistTurn> {
  const org = await db.get<{ id: string; name: string }>(`SELECT id, name FROM orgs WHERE id = ?`, [orgId]);
  if (!org) throw new Error("org not found");
  const services = await db.all<{ id: string; name: string; price: number; duration_min: number }>(
    `SELECT id, name, price, duration_min FROM services WHERE org_id = ? AND active = 1`,
    [orgId],
  );
  const m = message.toLowerCase();
  let reply: string;
  let intent: ReceptionistTurn["intent"] = "smalltalk";
  let proposal: ReceptionistTurn["proposal"];

  const cheapest = [...services].sort((a, b) => a.price - b.price)[0];
  const wantsBook = /book|appointment|slot|reserve|come|sched/.test(m);
  const wantsPrice = /price|cost|how much|quote|£|charge/.test(m);
  const wantsServices = /service|offer|do you do|valet|wash|detail|clean/.test(m);
  const wantsAvail = /when|today|tomorrow|available|free|time/.test(m);

  if (wantsBook || wantsAvail) {
    const slots = await availability(db, orgId, todayIso());
    const open = slots.find((s) => s.available);
    intent = wantsBook ? "booking_proposal" : "availability";
    if (open && cheapest) {
      proposal = { serviceId: cheapest.id, serviceName: cheapest.name, price: cheapest.price, date: todayIso(), time: open.time };
      reply = `Hi, you've reached ${org.name}. We've got an opening today at ${open.time}. I can pencil you in for our ${cheapest.name} at £${cheapest.price} — shall I send a confirmation link for you to approve?`;
    } else {
      reply = `Hi, you've reached ${org.name}. We're fully booked today — would you like me to look at tomorrow?`;
    }
  } else if (wantsPrice && cheapest) {
    intent = "price";
    reply = `Our prices start at £${cheapest.price} for the ${cheapest.name}. Would you like the full list or to check availability?`;
  } else if (wantsServices && services.length) {
    intent = "services";
    reply = `${org.name} offers ${services.slice(0, 3).map((s) => s.name).join(", ")}${services.length > 3 ? " and more" : ""}. Which one interests you?`;
  } else {
    reply = `Hi, you've reached ${org.name}. I can tell you about our services, prices, or find you a slot — what can I help with?`;
  }

  const audio = await voice.synthesize(reply, "agent");
  await audit(db, {
    action: "voice.receptionist",
    targetType: "org",
    targetId: orgId,
    meta: { intent, voiceMode: audio.mode, proposed: !!proposal, movedMoney: false },
  });

  return { reply, intent, proposal, audioBase64: audio.audioBase64, voiceMode: audio.mode, grounded: true };
}
