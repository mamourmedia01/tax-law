import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronRight,
  Download,
  FileText,
  Gift,
  Heart,
  HelpCircle,
  Info,
  LayoutDashboard,
  LogOut,
  Pencil,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";

const INFO_LINKS = [
  { icon: HelpCircle, label: "Help Centre", note: "FAQs & support", to: "/help" },
  { icon: BookOpen, label: "How to use Fable+", note: "Customer guide", to: "/guide/customer" },
  { icon: Truck, label: "Fleet & business", note: "Get a quote for your fleet", to: "/business" },
  { icon: Info, label: "About Fable+", note: "Our no-fee promise", to: "/about" },
  { icon: ShieldCheck, label: "Privacy Policy", note: "How we handle your data", to: "/legal/privacy" },
  { icon: FileText, label: "Terms of Service", note: "The agreement (draft)", to: "/legal/terms" },
  { icon: ShieldCheck, label: "Regulations & compliance", note: "How we stay compliant", to: "/legal/regulations" },
];
import { api, ApiError } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useStore } from "../lib/store";
import { ImageTile } from "../components/ImageTile";
import { initials, money } from "../lib/format";

function SignIn() {
  const { setUser, refreshMe } = useStore();
  const [contact, setContact] = useState("");
  const [stage, setStage] = useState<"form" | "code">("form");
  const [code, setCode] = useState("");
  const [dev, setDev] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr(null);
    setBusy(true);
    try {
      const { devCode } = await api.requestOtp(contact.trim());
      setDev(devCode ?? null);
      setStage("code");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setErr(null);
    setBusy(true);
    try {
      const { user } = await api.verifyOtp(contact.trim(), code.trim());
      setUser(user);
      await refreshMe();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Incorrect code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-5">
      <p className="t-h3">Sign in</p>
      <p className="t-caption text-grey-500">Access your bookings on any device. Providers sign in here too.</p>
      {stage === "form" ? (
        <>
          <input className="field" placeholder="Mobile or email" value={contact} onChange={(e) => setContact(e.target.value)} />
          {err && <p className="t-caption text-error">{err}</p>}
          <button type="button" disabled={busy || contact.trim().length < 5} onClick={send} className="btn-primary w-full">
            {busy ? "Sending…" : "Send code"}
          </button>
        </>
      ) : (
        <>
          {dev && (
            <p className="t-caption rounded-input bg-teal-50 p-2 text-teal-800">
              Sandbox code: <span className="font-semibold tracking-widest">{dev}</span>
            </p>
          )}
          <input
            className="field text-center text-[22px] tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="••••••"
          />
          {err && <p className="t-caption text-error">{err}</p>}
          <button type="button" disabled={busy || code.length !== 6} onClick={verify} className="btn-primary w-full">
            {busy ? "Verifying…" : "Verify"}
          </button>
        </>
      )}
    </div>
  );
}

function Referral() {
  const r = useAsync(() => api.referral(), []);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function apply() {
    setMsg(null);
    try {
      const res = await api.applyReferral(code.trim());
      setMsg(`Applied! ${money(res.credited)} added to your wallet.`);
      setCode("");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not apply code");
    }
  }

  return (
    <div className="px-5 pt-4">
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          <Gift size={18} className="text-teal-700" />
          <p className="t-h3">Refer a friend</p>
        </div>
        <p className="t-caption mb-3 text-grey-500">
          Share your code — you both get £{r.data?.creditPerReferral ?? 5} when they book. ({r.data?.referrals ?? 0} referred)
        </p>
        {r.data?.code && (
          <div className="mb-3 flex items-center justify-between rounded-input bg-teal-50 p-3">
            <span className="nums text-[18px] tracking-widest text-teal-800">{r.data.code}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(r.data!.code)}
              className="t-label text-teal-700"
            >
              Copy
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input className="field flex-1" placeholder="Have a code? Enter it" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button type="button" onClick={apply} disabled={code.length < 4} className="btn-secondary px-4">
            Apply
          </button>
        </div>
        {msg && <p className="t-caption mt-2 text-grey-500">{msg}</p>}
      </div>
    </div>
  );
}

function Wallet() {
  const w = useAsync(() => api.wallet(), []);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const balance = w.data?.balance ?? 0;

  async function redeem() {
    setMsg(null);
    try {
      const r = await api.redeemGiftCard(code.trim());
      setMsg(`Added ${money(r.credited)} to your wallet.`);
      setCode("");
      w.reload();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not redeem");
    }
  }
  async function buy() {
    setMsg(null);
    try {
      const r = await api.issueGiftCard(25);
      setMsg(`Gift card created: ${r.code} (£${r.amount}). Share it with a friend.`);
    } catch {
      setMsg("Could not create gift card");
    }
  }

  return (
    <div className="px-5 pt-4">
      <div className="relative overflow-hidden rounded-card bg-teal-gradient p-5 text-white shadow-float">
        <div className="flex items-center justify-between">
          <div>
            <p className="t-caption text-white/85">Fable+ credit</p>
            <p className="font-display text-[28px] font-bold">{money(balance)}</p>
          </div>
          <Gift size={30} className="opacity-90" />
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Gift card code"
            className="h-10 flex-1 rounded-input bg-white/20 px-3 text-[14px] text-white placeholder:text-white/70 outline-none focus:bg-white/30"
          />
          <button type="button" onClick={redeem} disabled={code.length < 6} className="btn h-10 bg-white px-4 text-[14px] text-teal-800 disabled:opacity-50">
            Redeem
          </button>
        </div>
        <button type="button" onClick={buy} className="t-caption mt-2 text-white/90 underline">
          Buy a £25 gift card for a friend
        </button>
        {msg && <p className="t-caption mt-2 rounded bg-white/15 p-2">{msg}</p>}
      </div>
    </div>
  );
}

export function Profile() {
  const { user, logout, setUser, favourites } = useStore();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const providers = useAsync(() => api.providers({}), []);
  const bookings = useAsync(() => (user ? api.bookings() : Promise.resolve([])), [user?.id]);

  const saved = (providers.data ?? []).filter((p) => favourites.includes(p.id));
  const hasAccount = !!user;

  async function save() {
    const { user: u } = await api.updateAccount(form);
    setUser(u);
    setEditing(false);
  }
  async function toggleMarketing() {
    if (!user) return;
    const { user: u } = await api.updateAccount({ marketing_consent: !user.marketingConsent });
    setUser(u);
  }
  async function exportData() {
    const data = await api.exportAccount();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fableplus-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function deleteAccount() {
    if (!confirm("Delete your account and all your data? This cannot be undone.")) return;
    await api.deleteAccount().catch(() => {});
    setUser(null);
  }

  return (
    <div className="animate-fade-up">
      <div className="px-5 pb-3 pt-4">
        <h1 className="t-h1">Profile</h1>
      </div>

      {!hasAccount ? (
        <div className="px-5">
          <SignIn />
        </div>
      ) : (
        <div className="px-5">
          <div className="card p-5">
            {!editing ? (
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-teal-gradient font-display text-[18px] font-bold text-white">
                  {initials(user.name || user.email || "You")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="t-h3 truncate">{user.name || "Your account"}</p>
                  <p className="t-caption truncate text-grey-500">{user.email || user.phone}</p>
                  {!user.claimed && <span className="badge mt-1.5 bg-warning/15 text-warning">Add your name</span>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ name: user.name, email: user.email ?? "", phone: user.phone ?? "" });
                    setEditing(true);
                  }}
                  aria-label="Edit profile"
                  className="focusable grid h-10 w-10 place-items-center rounded-full text-teal-700 hover:bg-teal-50"
                >
                  <Pencil size={18} />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input className="field" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="field" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <input className="field" placeholder="Mobile number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button type="button" onClick={save} className="btn-primary flex-1">
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* wallet */}
      {hasAccount && <Wallet />}
      {hasAccount && <Referral />}

      {hasAccount && (
        <div className="grid grid-cols-2 gap-3 px-5 pt-4">
          <Link to="/bookings" className="card focusable p-4">
            <p className="nums text-[24px]">{bookings.data?.length ?? 0}</p>
            <p className="t-caption text-grey-500">Bookings</p>
          </Link>
          <div className="card p-4">
            <p className="nums text-[24px]">{saved.length}</p>
            <p className="t-caption flex items-center gap-1 text-grey-500">
              <Heart size={13} /> Saved
            </p>
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div className="pt-6">
          <h2 className="t-h3 mb-3 px-5">Saved providers</h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-2">
            {saved.map((p) => (
              <Link key={p.id} to={`/p/${p.slug}`} className="focusable w-40 shrink-0">
                <ImageTile seed={p.seed} className="h-24 w-full" label={p.name} />
                <p className="t-label mt-1.5 truncate">{p.name}</p>
                <p className="t-caption text-grey-500">from {money(p.priceFrom)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasAccount && (
        <>
          {/* consent + data controls */}
          <div className="px-5 pt-6">
            <div className="card divide-y divide-grey-100 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
                  <ShieldCheck size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="t-label">Marketing messages</p>
                  <p className="t-caption text-grey-500">Offers & rebook reminders (separate from booking updates)</p>
                </div>
                <button
                  type="button"
                  onClick={toggleMarketing}
                  role="switch"
                  aria-checked={user.marketingConsent}
                  className={`focusable relative h-7 w-12 rounded-full transition-colors ${user.marketingConsent ? "bg-teal-700" : "bg-grey-200"}`}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${user.marketingConsent ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
              <button type="button" onClick={exportData} className="focusable flex w-full items-center gap-3 p-4 text-left hover:bg-teal-50/50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
                  <Download size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-label block">Export my data</span>
                  <span className="t-caption block text-grey-500">Download everything we hold (GDPR)</span>
                </span>
                <ChevronRight size={18} className="text-grey-400" />
              </button>
              <button type="button" onClick={deleteAccount} className="focusable flex w-full items-center gap-3 p-4 text-left hover:bg-error/5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-error/10 text-error">
                  <Trash2 size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-label block text-error">Delete account</span>
                  <span className="t-caption block text-grey-500">Erase your data across every store</span>
                </span>
              </button>
            </div>
          </div>

          {/* information & legal */}
          <div className="px-5 pt-4">
            <div className="card divide-y divide-grey-100 overflow-hidden">
              {INFO_LINKS.map(({ icon: Icon, label, note, to }) => (
                <Link key={to} to={to} className="focusable flex items-center gap-3 p-4 hover:bg-teal-50/50">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-label block">{label}</span>
                    <span className="t-caption block text-grey-500">{note}</span>
                  </span>
                  <ChevronRight size={18} className="text-grey-400" />
                </Link>
              ))}
            </div>
          </div>

          {/* provider dashboard */}
          <div className="px-5 pt-4">
            <Link to="/dashboard" className="card focusable flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700">
                <LayoutDashboard size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-label">Provider dashboard</p>
                <p className="t-caption text-grey-500">For provider accounts — caps, verification, copilot</p>
              </div>
              <ChevronRight size={18} className="text-grey-400" />
            </Link>
          </div>

          <div className="px-5 py-6">
            <button type="button" onClick={logout} className="btn-tertiary mx-auto flex text-grey-500">
              <LogOut size={18} /> Sign out
            </button>
            <p className="t-caption mt-4 text-center text-grey-400">Fable+ · v0.2 · No platform fees, ever</p>
          </div>
        </>
      )}
    </div>
  );
}
