import type { Db } from "./database.js";
import { id, now } from "./lib.js";
import { audit } from "./audit.js";

export type Bucket = "transactional" | "marketing";

// ---------------------------------------------------------------------------
// FW33 notifications & nudges.
//
// Delivery channels are swap-ready adapters (sandbox logs to console). Real
// email/SMS/push providers (SES/Twilio/FCM/APNs) drop in behind the same interface.
// Consent is two-bucket (I32): transactional always delivers; marketing only with
// consent AND outside quiet hours. Rebook nudges are DOUBLE-gated (I33).
// ---------------------------------------------------------------------------

export interface DeliveryChannel {
  readonly name: "push" | "email" | "sms";
  send(to: { email: string | null; phone: string | null }, title: string, body: string): Promise<boolean>;
}

class SandboxChannel implements DeliveryChannel {
  constructor(readonly name: "push" | "email" | "sms") {}
  async send(to: { email: string | null; phone: string | null }, title: string): Promise<boolean> {
    const addr = this.name === "sms" ? to.phone : this.name === "email" ? to.email : "device";
    if (this.name !== "push" && !addr) return false;
    console.log(`[notify:${this.name}] -> ${addr ?? "device"} :: ${title}`);
    return true;
  }
}

export function makeChannels(): DeliveryChannel[] {
  // real: [new SesEmail(...), new TwilioSms(...), new FcmPush(...)]
  return [new SandboxChannel("push"), new SandboxChannel("email"), new SandboxChannel("sms")];
}

// Quiet hours for MARKETING only (local-ish 21:00–08:00 suppressed).
function inQuietHours(d = new Date()): boolean {
  const h = d.getHours();
  return h >= 21 || h < 8;
}

interface NotifyOpts {
  bucket: Bucket;
  type: string;
  title: string;
  body: string;
  channels?: DeliveryChannel[]; // if provided, attempt delivery
  ignoreQuietHours?: boolean;
}

export async function notify(db: Db, userId: string, n: NotifyOpts): Promise<boolean> {
  const user = await db.get<{ email: string | null; phone: string | null; marketing_consent: number }>(
    `SELECT email, phone, marketing_consent FROM users WHERE id = ?`,
    [userId],
  );
  if (!user) return false;

  // consent gate (I32)
  if (n.bucket === "marketing" && !user.marketing_consent) return false;
  // quiet hours for marketing (transactional always allowed)
  const suppressedByQuiet = n.bucket === "marketing" && !n.ignoreQuietHours && inQuietHours();

  let deliveredVia: string[] = [];
  if (n.channels && !suppressedByQuiet) {
    for (const ch of n.channels) {
      const ok = await ch.send({ email: user.email, phone: user.phone }, n.title, n.body);
      if (ok) deliveredVia.push(ch.name);
    }
  }

  await db.run(
    `INSERT INTO notifications (id, user_id, bucket, type, title, body, delivered_via, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id("ntf"), userId, n.bucket, n.type, n.title, n.body, deliveredVia.join(",") || null, now()],
  );
  return true;
}

export async function listNotifications(db: Db, userId: string) {
  return db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId]);
}

// --- the rebook nudge engine (double-gated, I33) ----------------------------
// Sends a "time for another wash?" nudge to a provider's lapsed customers — but ONLY if
// (A) the provider opted in (orgs.rebook_nudges) AND (B) the customer consented to marketing.
export async function runRebookNudges(
  db: Db,
  channels: DeliveryChannel[],
  orgId: string,
  lapsedDays = 30,
): Promise<{ sent: number; suppressed: number; providerOptIn: boolean }> {
  const org = await db.get<{ id: string; name: string; rebook_nudges: number }>(
    `SELECT id, name, rebook_nudges FROM orgs WHERE id = ?`,
    [orgId],
  );
  if (!org) return { sent: 0, suppressed: 0, providerOptIn: false };
  // GATE A: provider must have opted in.
  if (!org.rebook_nudges) return { sent: 0, suppressed: 0, providerOptIn: false };

  const cutoff = now() - lapsedDays * 24 * 60 * 60 * 1000;
  // distinct customers whose most recent booking with this org is older than the cutoff
  const lapsed = await db.all<{ customer_user_id: string; last: number }>(
    `SELECT customer_user_id, MAX(created_at) AS last FROM bookings
     WHERE org_id = ? AND status != 'cancelled'
     GROUP BY customer_user_id HAVING MAX(created_at) < ?`,
    [orgId, cutoff],
  );

  let sent = 0;
  let suppressed = 0;
  for (const c of lapsed) {
    // GATE B is enforced inside notify() (marketing consent). It returns false if suppressed.
    const ok = await notify(db, c.customer_user_id, {
      bucket: "marketing",
      type: "rebook_nudge",
      title: `Time for another visit to ${org.name}?`,
      body: `It's been a while — book your next appointment with ${org.name}.`,
      channels,
    });
    if (ok) sent++;
    else suppressed++;
  }
  await audit(db, { action: "nudges.run", targetType: "org", targetId: orgId, meta: { sent, suppressed, lapsed: lapsed.length } });
  return { sent, suppressed, providerOptIn: true };
}
