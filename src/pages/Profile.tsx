import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  CreditCard,
  Gift,
  Heart,
  HelpCircle,
  Info,
  LogOut,
  Pencil,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useStore } from "../lib/store";
import { PROVIDERS } from "../data/providers";
import { ImageTile } from "../components/ImageTile";
import { initials, money } from "../lib/format";

const MENU = [
  { icon: CreditCard, label: "Payment methods", note: "Pay providers directly" },
  { icon: Bell, label: "Notifications", note: "Reminders & nudges" },
  { icon: HelpCircle, label: "Help Center", note: "FAQs & support" },
  { icon: Info, label: "About Fable+", note: "Our no-fee promise" },
  { icon: ShieldCheck, label: "Privacy & Terms", note: "How we handle your data" },
];

export function Profile() {
  const { user, setUser, favourites, bookings } = useStore();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user.name, phone: user.phone, email: user.email });
  const saved = PROVIDERS.filter((p) => favourites.includes(p.id));
  const hasAccount = Boolean(user.name || user.email);

  function save() {
    setUser({ ...form, claimed: true });
    setEditing(false);
  }

  return (
    <div className="animate-fade-up">
      <div className="px-5 pb-3 pt-4">
        <h1 className="t-h1">Profile</h1>
      </div>

      {/* identity */}
      <div className="px-5">
        <div className="card p-5">
          {!editing ? (
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-teal-gradient font-display text-[18px] font-bold text-white">
                {hasAccount ? initials(user.name || "You") : "👤"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="t-h3 truncate">{hasAccount ? user.name || "Your account" : "Guest"}</p>
                <p className="t-caption truncate text-grey-500">
                  {hasAccount ? user.email || user.phone : "Book once and your account is created"}
                </p>
                {hasAccount && !user.claimed && (
                  <span className="badge mt-1.5 bg-warning/15 text-warning">Claim your account</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit profile"
                className="focusable grid h-10 w-10 place-items-center rounded-full text-teal-700 hover:bg-teal-50"
              >
                <Pencil size={18} />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                className="field"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="field"
                placeholder="Mobile number"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                className="field"
                placeholder="Email"
                inputMode="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
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

      {/* wallet — signature teal gradient */}
      <div className="px-5 pt-4">
        <div className="relative overflow-hidden rounded-card bg-teal-gradient p-5 text-white shadow-float">
          <div className="flex items-center justify-between">
            <div>
              <p className="t-caption text-white/85">Fable+ credit</p>
              <p className="font-display text-[28px] font-bold">{money(0)}</p>
            </div>
            <Gift size={30} className="opacity-90" />
          </div>
          <p className="t-caption mt-3 text-white/85">
            Refer a friend — you both get £5 credit when they book.
          </p>
        </div>
      </div>

      {/* quick stats */}
      <div className="grid grid-cols-2 gap-3 px-5 pt-4">
        <Link to="/bookings" className="card focusable p-4">
          <p className="nums text-[24px]">{bookings.length}</p>
          <p className="t-caption text-grey-500">Bookings</p>
        </Link>
        <div className="card p-4">
          <p className="nums text-[24px]">{saved.length}</p>
          <p className="t-caption flex items-center gap-1 text-grey-500">
            <Heart size={13} /> Saved
          </p>
        </div>
      </div>

      {/* saved providers */}
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

      {/* menu */}
      <div className="px-5 pt-6">
        <div className="card divide-y divide-grey-100 overflow-hidden">
          {MENU.map(({ icon: Icon, label, note }) => (
            <button
              key={label}
              type="button"
              className="focusable flex w-full items-center gap-3 p-4 text-left hover:bg-teal-50/50"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-label block">{label}</span>
                <span className="t-caption block text-grey-500">{note}</span>
              </span>
              <ChevronRight size={18} className="text-grey-400" />
            </button>
          ))}
        </div>
      </div>

      {/* become a provider */}
      <div className="px-5 pt-4">
        <div className="card flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700">
            <Store size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-label">List your business</p>
            <p className="t-caption text-grey-500">No commission — one simple subscription.</p>
          </div>
          <button type="button" className="btn-secondary h-10 shrink-0 px-4 text-[14px]">
            Join
          </button>
        </div>
      </div>

      <div className="px-5 py-6">
        <button type="button" className="btn-tertiary mx-auto flex text-grey-500">
          <LogOut size={18} /> Sign out
        </button>
        <p className="t-caption mt-4 text-center text-grey-400">Fable+ · v0.1 · No platform fees, ever</p>
      </div>
    </div>
  );
}
