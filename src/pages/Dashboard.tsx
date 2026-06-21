import { useState } from "react";
import { BadgeCheck, BellRing, Brain, Check, CreditCard, Download, FileText, Lightbulb, MapPin, QrCode, Send, Share2, TrendingUp, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { TopBar } from "../components/TopBar";
import { ListSkeleton, ErrorState } from "../components/States";
import { money } from "../lib/format";

function Meter({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const pct = cap === null ? 0 : Math.min(100, (used / cap) * 100);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="t-caption text-grey-500">{label}</span>
        <span className="nums text-ink">
          {used}
          {cap === null ? " / ∞" : ` / ${cap}`}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-grey-100">
        <div className={`h-full rounded-full ${pct > 85 ? "bg-warning" : "bg-teal-600"}`} style={{ width: `${cap === null ? 8 : pct}%` }} />
      </div>
    </div>
  );
}

export function Dashboard() {
  const me = useAsync(() => api.providerMe(), []);
  const bookings = useAsync(() => api.providerBookings().catch(() => []), []);

  if (me.loading) {
    return (
      <div>
        <TopBar title="Dashboard" />
        <div className="px-5 pt-4">
          <ListSkeleton count={2} />
        </div>
      </div>
    );
  }

  if (me.error?.status === 403) {
    return (
      <div>
        <TopBar title="Dashboard" />
        <div className="card mx-5 mt-6 p-8 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-teal-100 text-teal-700">
            <BadgeCheck size={26} />
          </span>
          <p className="t-h3 mb-1">This is for provider accounts</p>
          <p className="t-body text-grey-500">
            Sign in with a provider email to see your dashboard. In this sandbox you can use, for example,{" "}
            <span className="font-semibold">jamies-mobile-valet@provider.fableplus</span> — the one-time code is shown on screen.
          </p>
        </div>
      </div>
    );
  }
  if (me.error) return <ErrorState error={me.error} onRetry={me.reload} />;
  if (!me.data) return null;

  const { org, entitlements: ent } = me.data;

  return (
    <div className="min-h-screen pb-10">
      <TopBar title="Dashboard" />

      <div className="space-y-4 px-5 pt-4">
        {/* identity */}
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <h1 className="t-h2">{org.name}</h1>
            {org.verified ? (
              <BadgeCheck size={20} className="text-teal-600" />
            ) : (
              <span className="badge bg-warning/15 text-warning">Unverified</span>
            )}
          </div>
          <p className="t-caption mt-1 text-grey-500">
            {ent.tier.charAt(0).toUpperCase() + ent.tier.slice(1)} plan · own-client bookings unlimited
          </p>
        </div>

        {!org.verified && <Verification onChange={me.reload} />}

        <ShareQR slug={org.slug} name={org.name} />

        {/* entitlements */}
        <div className="card space-y-4 p-5">
          <p className="t-h3">This month</p>
          <Meter label="Marketplace leads" used={ent.leads.used} cap={ent.leads.cap} />
          <Meter label="Client slots" used={ent.clients.used} cap={ent.clients.cap} />
          <p className="t-caption text-grey-500">Leads & client slots scale by plan — your own-client bookings never count.</p>
        </div>

        <PlanBilling onChange={me.reload} />

        <Nudges initial={me.data.org.rebookNudges} />

        <ServiceRadius initial={me.data.org.serviceRadiusKm} />

        <Team />
        <TaxDetails />
        <PayoutDetails />

        {/* copilot */}
        {ent.ai.copilot || ent.ai.providerSuite ? <Copilot /> : (
          <div className="card flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-grey-100 text-grey-400">
              <Brain size={19} />
            </span>
            <p className="t-caption text-grey-500">The AI copilot is available on Growth and Fleet plans.</p>
          </div>
        )}

        {/* recent bookings */}
        <div className="card p-5">
          <p className="t-h3 mb-3">Recent bookings</p>
          {bookings.loading && <div className="skeleton h-20 w-full" />}
          <div className="space-y-2">
            {(bookings.data ?? []).slice(0, 8).map((b) => (
              <div key={b.id} className="border-b border-grey-100 pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="t-label">{b.date} · {b.time}</p>
                    <p className="t-caption text-grey-500">
                      {b.source === "marketplace_lead" ? "Marketplace" : "Own client"} · {b.status}
                    </p>
                  </div>
                  <span className="nums text-ink">{money(b.total)}</span>
                </div>
                {b.status === "confirmed" && (
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={async () => { await api.setBookingStatus(b.id, "completed").catch(() => {}); bookings.reload(); }}
                      className="btn-secondary h-8 px-3 text-[13px]"
                    >
                      Mark complete
                    </button>
                    <button
                      type="button"
                      onClick={async () => { await api.setBookingStatus(b.id, "no_show").catch(() => {}); bookings.reload(); }}
                      className="btn h-8 border border-grey-200 bg-white px-3 text-[13px] text-grey-500"
                    >
                      No-show
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!bookings.loading && (bookings.data ?? []).length === 0 && (
              <p className="t-caption text-grey-500">No bookings yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanBilling({ onChange }: { onChange: () => void }) {
  const sub = useAsync(() => api.subscription(), []);
  const [busy, setBusy] = useState<string | null>(null);

  async function choose(tier: string) {
    setBusy(tier);
    try {
      await api.setSubscription(tier);
      sub.reload();
      onChange();
    } finally {
      setBusy(null);
    }
  }

  if (sub.loading || !sub.data) return <div className="skeleton h-40 w-full rounded-card" />;
  const current = sub.data.current;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard size={18} className="text-teal-700" />
        <p className="t-h3">Plan &amp; billing</p>
      </div>
      <p className="t-caption mb-3 text-grey-500">
        One subscription, no commission — Fable+ takes £0 of every job. Change anytime.
      </p>
      <div className="space-y-2.5">
        {sub.data.catalog.map((p) => {
          const active = p.tier === current;
          return (
            <button
              key={p.tier}
              type="button"
              disabled={active || busy !== null}
              onClick={() => choose(p.tier)}
              className={`focusable flex w-full items-center justify-between rounded-card border-2 p-4 text-left transition-colors ${
                active ? "border-teal-600 bg-teal-50" : "border-grey-200 bg-white hover:border-teal-400"
              }`}
            >
              <div>
                <p className="t-label flex items-center gap-1.5">
                  {p.label}
                  {active && <Check size={15} className="text-teal-600" />}
                </p>
                <p className="t-caption text-grey-500">
                  {p.leadsPerMonth ?? "∞"} leads · {p.clientSlots ?? "∞"} clients · {p.seats ?? "∞"} seats
                </p>
              </div>
              <div className="text-right">
                <p className="nums text-[18px]">£{p.price}</p>
                <p className="t-caption text-grey-500">/mo</p>
              </div>
            </button>
          );
        })}
      </div>
      {busy && <p className="t-caption mt-2 text-grey-500">Updating plan…</p>}
    </div>
  );
}

function ShareQR({ slug, name }: { slug: string; name: string }) {
  const qrUrl = `/api/providers/${slug}/qr.svg`;
  const cardUrl = `/api/providers/${slug}/share-card.svg`;
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <QrCode size={18} className="text-teal-700" />
        <p className="t-h3">Share your storefront</p>
      </div>
      <p className="t-caption mb-3 text-grey-500">Print or share your QR — customers scan it to book and fill your calendar.</p>
      <div className="flex items-center gap-4">
        <div className="rounded-card border border-grey-200 bg-white p-3">
          <img src={qrUrl} alt={`${name} booking QR`} width={120} height={120} />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <a href={qrUrl} download={`${slug}-qr.svg`} className="btn-secondary h-10 text-[14px]">
            <Download size={16} /> Download QR
          </a>
          <a href={cardUrl} target="_blank" rel="noreferrer" className="btn-secondary h-10 text-[14px]">
            <Share2 size={16} /> Share card
          </a>
        </div>
      </div>
    </div>
  );
}

function Verification({ onChange }: { onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function getVerified() {
    setBusy(true);
    try {
      // sandbox: submit ID, pass identity check, complete the remaining steps
      await api.submitKyc("id_front");
      await api.passKyc();
      for (const s of ["asset_check", "hmrc_details", "payout_setup", "twofa"]) await api.setVerStep(s, true);
      setDone(true);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <BadgeCheck size={18} className="text-warning" />
        <p className="t-h3">Get verified</p>
      </div>
      <p className="t-caption mb-3 text-grey-500">
        Verified providers appear in the marketplace, take in-app payments, and get the blue tick.
        Needs KYC + asset check + HMRC details + payout setup + 2FA.
      </p>
      <button type="button" onClick={getVerified} disabled={busy || done} className="btn-primary w-full">
        {done ? "Verified ✓ (refreshing…)" : busy ? "Verifying…" : "Complete verification (sandbox)"}
      </button>
    </div>
  );
}

function Nudges({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next);
    await api.setProviderSettings(next).catch(() => setOn(!next));
  }
  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.runNudges();
      setResult(r.providerOptIn ? `Sent ${r.sent}, suppressed ${r.suppressed} (no consent).` : "Turn on rebook nudges first.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <BellRing size={18} className="text-teal-700" />
        <p className="t-h3">Customer nudges</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="t-label">Rebook reminders</p>
          <p className="t-caption text-grey-500">Only sent to customers who opted into marketing (double-gated).</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          role="switch"
          aria-checked={on}
          className={`focusable relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-teal-700" : "bg-grey-200"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      <button type="button" onClick={run} disabled={busy || !on} className="btn-secondary mt-3 h-10 w-full text-[14px]">
        <Send size={16} /> {busy ? "Sending…" : "Send rebook nudges now"}
      </button>
      {result && <p className="t-caption mt-2 text-grey-500">{result}</p>}
    </div>
  );
}

function Team() {
  const t = useAsync(() => api.team(), []);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function invite() {
    setErr(null);
    try {
      await api.inviteTeam(name.trim(), contact.trim());
      setName(""); setContact("");
      t.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not invite");
    }
  }
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Users size={18} className="text-teal-700" />
        <p className="t-h3">Team</p>
      </div>
      <div className="mb-3 space-y-2">
        {(t.data ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-input bg-canvas px-3 py-2">
            <div><p className="t-label">{m.name}</p><p className="t-caption text-grey-500">{m.contact} · {m.role}</p></div>
            <button type="button" onClick={async () => { await api.removeTeam(m.id).catch(() => {}); t.reload(); }} className="t-caption text-error">Remove</button>
          </div>
        ))}
        {(t.data ?? []).length === 0 && <p className="t-caption text-grey-500">Just you so far.</p>}
      </div>
      <div className="flex gap-2">
        <input className="field flex-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field flex-1" placeholder="Phone/email" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      {err && <p className="t-caption mt-1.5 text-error">{err}</p>}
      <button type="button" onClick={invite} disabled={name.trim().length < 1 || contact.trim().length < 3} className="btn-secondary mt-2 h-10 w-full text-[14px]">Invite operative</button>
    </div>
  );
}

function ServiceRadius({ initial }: { initial: number }) {
  const [radius, setRadius] = useState(String(initial ?? 15));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setErr(null);
    setSaved(false);
    const km = Number(radius);
    try {
      const r = await api.setServiceRadius(km);
      setRadius(String(r.radiusKm));
      setSaved(true);
    } catch (e) {
      // Specific, correctable message from the API (valid range).
      setErr(e instanceof Error ? e.message : "Could not save radius");
    }
  }
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <MapPin size={18} className="text-emerald-700" />
        <p className="t-h3">Service radius</p>
      </div>
      <p className="t-caption mb-3 text-grey-500">
        Clients outside this distance can't book you. You can extend it for a specific client from their booking.
      </p>
      <div className="flex items-center gap-2">
        <input
          className="field w-28"
          type="number"
          min={1}
          max={200}
          value={radius}
          onChange={(e) => { setRadius(e.target.value); setSaved(false); }}
        />
        <span className="t-caption text-grey-500">km</span>
        <button type="button" onClick={save} className="btn-secondary ml-auto h-10 px-4 text-[14px]">Save</button>
      </div>
      {err && <p className="t-caption mt-2 text-error">{err}</p>}
      {saved && <p className="t-caption mt-2 text-success">Saved — you cover up to {radius} km.</p>}
    </div>
  );
}

function TaxDetails() {
  const h = useAsync(() => api.getHmrc(), []);
  const [form, setForm] = useState({ legalName: "", taxId: "", address: "" });
  const [saved, setSaved] = useState(false);
  const cur = h.data;

  async function save() {
    await api.saveHmrc(form).then(() => { setSaved(true); h.reload(); }).catch(() => {});
  }
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <FileText size={18} className="text-teal-700" />
        <p className="t-h3">Tax details (HMRC)</p>
      </div>
      <p className="t-caption mb-3 text-grey-500">Required for marketplace earnings reporting. Stored securely.</p>
      {cur && !saved ? (
        <p className="t-caption rounded-input bg-success/10 p-3 text-success">On file: {cur.legalName} · {cur.taxId}</p>
      ) : saved ? (
        <p className="t-caption rounded-input bg-success/10 p-3 text-success">Saved — thanks.</p>
      ) : (
        <div className="space-y-2">
          <input className="field" placeholder="Legal name" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
          <input className="field" placeholder="Tax ID / UTR / VAT" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          <input className="field" placeholder="Registered address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <button type="button" onClick={save} disabled={!form.legalName || !form.taxId || !form.address} className="btn-secondary h-10 w-full text-[14px]">Save tax details</button>
        </div>
      )}
    </div>
  );
}

function PayoutDetails() {
  const h = useAsync(() => api.getBankDetails(), []);
  const [form, setForm] = useState({ accountHolderName: "", sortCode: "", accountNumber: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const cur = h.data;

  async function save() {
    setErr(null);
    try {
      await api.saveBankDetails(form);
      setSaved(true);
      h.reload();
    } catch (e) {
      // Specific, correctable message from the API (sort-code/account length, modulus check).
      setErr(e instanceof Error ? e.message : "Could not save bank details");
    }
  }
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <CreditCard size={18} className="text-teal-700" />
        <p className="t-h3">Payout bank details</p>
      </div>
      <p className="t-caption mb-3 text-grey-500">
        Your UK bank account for payouts. Stored encrypted — we only ever show the last 4 digits.
      </p>
      {cur && !saved ? (
        <p className="t-caption rounded-input bg-success/10 p-3 text-success">
          On file: {cur.accountHolderName} · {cur.sortCodeMasked} · {cur.accountNumberMasked}
        </p>
      ) : saved ? (
        <p className="t-caption rounded-input bg-success/10 p-3 text-success">Saved — payout setup complete.</p>
      ) : (
        <div className="space-y-2">
          <input className="field" placeholder="Account holder name" value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })} />
          <input className="field" placeholder="Sort code (e.g. 12-34-56)" value={form.sortCode} onChange={(e) => setForm({ ...form, sortCode: e.target.value })} />
          <input className="field" placeholder="Account number (8 digits)" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          {err && <p className="t-caption text-error">{err}</p>}
          <button type="button" onClick={save} disabled={!form.accountHolderName || !form.sortCode || !form.accountNumber} className="btn-secondary h-10 w-full text-[14px]">Save bank details</button>
        </div>
      )}
    </div>
  );
}

function Copilot() {
  const { data, loading, error } = useAsync(() => api.copilot(), []);
  if (loading) return <div className="skeleton h-40 w-full rounded-card" />;
  if (error || !data) return null;
  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Brain size={18} className="text-teal-700" />
        <p className="t-h3">Business copilot</p>
      </div>
      <p className="t-caption mb-3 text-grey-500">
        Grounded in your own data ({data.model}). Suggestions only — you approve every action.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-input bg-teal-50 p-3">
          <TrendingUp size={15} className="text-teal-700" />
          <p className="nums mt-1 text-[18px]">{money(Number(data.generatedFrom.revenueThisMonth ?? 0))}</p>
          <p className="t-caption text-grey-500">This month</p>
        </div>
        <div className="rounded-input bg-teal-50 p-3">
          <Users size={15} className="text-teal-700" />
          <p className="nums mt-1 text-[18px]">{data.generatedFrom.distinctCustomers ?? 0}</p>
          <p className="t-caption text-grey-500">Customers</p>
        </div>
        <div className="rounded-input bg-teal-50 p-3">
          <Lightbulb size={15} className="text-teal-700" />
          <p className="nums mt-1 text-[18px]">{data.generatedFrom.repeatRate ?? 0}%</p>
          <p className="t-caption text-grey-500">Repeat</p>
        </div>
      </div>

      <div className="space-y-3">
        {data.suggestions.map((s, i) => (
          <div key={i} className="rounded-input border border-grey-200 p-3">
            <p className="t-label">{s.title}</p>
            <p className="t-caption mt-0.5 text-grey-700">{s.detail}</p>
            <p className="t-caption mt-1.5 text-grey-500">
              <span className="font-semibold">Why:</span> {s.reason}
            </p>
            <button type="button" className="btn-secondary mt-2 h-9 px-3 text-[13px]">
              {s.action}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
