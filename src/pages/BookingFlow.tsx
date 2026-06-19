import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, Check, Clock, ShieldCheck } from "lucide-react";
import { getProvider } from "../data/providers";
import { ImageTile } from "../components/ImageTile";
import { TopBar } from "../components/TopBar";
import { useStore } from "../lib/store";
import {
  duration,
  formatDate,
  isoDate,
  makeRef,
  money,
  relativeDay,
  to12h,
} from "../lib/format";
import type { Booking } from "../types";
import { NotFound } from "./NotFound";

const STEPS = ["Services", "Date & time", "Your details", "Review"];

function nextDays(n: number): Date[] {
  const out: Date[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

function slotsFor(iso: string): { time: string; available: boolean }[] {
  const out: { time: string; available: boolean }[] = [];
  // deterministic pseudo-availability from the date string
  let seed = 0;
  for (let i = 0; i < iso.length; i++) seed = (seed * 31 + iso.charCodeAt(i)) % 997;
  for (let h = 8; h <= 18; h++) {
    for (const m of [0, 30]) {
      seed = (seed * 1103515245 + 12345) % 2147483647;
      out.push({ time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, available: seed % 5 !== 0 });
    }
  }
  return out;
}

export function BookingFlow() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const provider = slug ? getProvider(slug) : undefined;
  const { user, setUser, addBooking } = useStore();

  const preselect = (location.state as { serviceId?: string } | null)?.serviceId;
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(preselect ? [preselect] : []);
  const days = useMemo(() => nextDays(14), []);
  const [date, setDate] = useState<string>(isoDate(days[0]));
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ name: user.name, phone: user.phone, email: user.email });

  if (!provider) return <NotFound />;

  const chosen = provider.services.filter((s) => selected.includes(s.id));
  const total = chosen.reduce((sum, s) => sum + s.price, 0);
  const totalMin = chosen.reduce((sum, s) => sum + s.durationMin, 0);
  const slots = slotsFor(date);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const phoneOk = form.phone.replace(/\D/g, "").length >= 10;
  const detailsOk = form.name.trim().length > 1 && phoneOk && emailOk;

  const canNext =
    (step === 0 && selected.length > 0) ||
    (step === 1 && !!time) ||
    (step === 2 && detailsOk) ||
    step === 3;

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function confirm() {
    if (!time) return;
    const booking: Booking = {
      id: crypto.randomUUID(),
      ref: makeRef(),
      providerId: provider!.id,
      providerSlug: provider!.slug,
      providerName: provider!.name,
      providerSeed: provider!.seed,
      serviceIds: chosen.map((s) => s.id),
      serviceNames: chosen.map((s) => s.name),
      date,
      time,
      durationMin: totalMin,
      total,
      status: "confirmed",
      customer: { ...form },
      createdAt: Date.now(),
    };
    // guest checkout: auto-create / update the claimable account
    setUser({ ...form, claimed: user.claimed });
    addBooking(booking);
    navigate(`/booking/${booking.id}?new=1`, { replace: true });
  }

  function onNext() {
    if (step < 3) setStep((s) => s + 1);
    else confirm();
  }

  return (
    <div className="min-h-screen pb-32">
      <TopBar title="Book" />

      {/* stepper */}
      <div className="px-5 pt-3">
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col gap-1.5">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-teal-600" : "bg-grey-200"}`} />
              <span className={`text-[11px] ${i === step ? "font-semibold text-teal-800" : "text-grey-400"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* provider strip */}
      <div className="mx-5 mt-4 flex items-center gap-3 rounded-card bg-white p-3 shadow-card">
        <ImageTile seed={provider.seed} className="h-12 w-12 shrink-0" rounded="rounded-input" />
        <div className="min-w-0">
          <p className="t-label flex items-center gap-1 truncate">
            {provider.name}
            {provider.verified && <BadgeCheck size={15} className="text-teal-600" />}
          </p>
          <p className="t-caption text-grey-500">{provider.area}</p>
        </div>
      </div>

      <div className="px-5 pt-5 animate-fade-up" key={step}>
        {step === 0 && (
          <section className="space-y-3">
            <h2 className="t-h3">Choose your services</h2>
            {provider.services.map((s) => {
              const on = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={on}
                  className={`focusable flex w-full items-center gap-3 rounded-card border-2 bg-white p-4 text-left transition-colors ${
                    on ? "border-teal-600" : "border-transparent shadow-card"
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${
                      on ? "border-teal-600 bg-teal-600 text-white" : "border-grey-200"
                    }`}
                  >
                    {on && <Check size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-label block">{s.name}</span>
                    <span className="t-caption block text-grey-500">{s.description}</span>
                    <span className="t-caption mt-1 flex items-center gap-1 text-grey-500">
                      <Clock size={13} /> {duration(s.durationMin)}
                    </span>
                  </span>
                  <span className="nums shrink-0 text-ink">{money(s.price)}</span>
                </button>
              );
            })}
          </section>
        )}

        {step === 1 && (
          <section>
            <h2 className="t-h3 mb-3">Pick a date</h2>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {days.map((d) => {
                const iso = isoDate(d);
                const on = iso === date;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      setDate(iso);
                      setTime(null);
                    }}
                    aria-pressed={on}
                    className={`focusable flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-input border ${
                      on ? "border-teal-700 bg-teal-100 text-teal-800" : "border-grey-200 bg-white text-ink"
                    }`}
                  >
                    <span className="text-[11px] uppercase">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}
                    </span>
                    <span className="nums text-[20px]">{d.getDate()}</span>
                    <span className="text-[10px] text-grey-500">
                      {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}
                    </span>
                  </button>
                );
              })}
            </div>

            <h2 className="t-h3 mb-3 mt-6">
              Available times <span className="t-caption font-normal text-grey-500">· {relativeDay(date)}</span>
            </h2>
            <div className="grid grid-cols-3 gap-2.5">
              {slots.map((sl) => (
                <button
                  key={sl.time}
                  type="button"
                  disabled={!sl.available}
                  onClick={() => setTime(sl.time)}
                  aria-pressed={time === sl.time}
                  className={`focusable h-12 rounded-input border text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:border-grey-100 disabled:bg-grey-100 disabled:text-grey-400 ${
                    time === sl.time
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-grey-200 bg-white text-ink hover:border-teal-400"
                  }`}
                >
                  {to12h(sl.time)}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <div>
              <h2 className="t-h3">Your details</h2>
              <p className="t-caption mt-1 text-grey-500">
                No account needed — we'll text a one-time code to confirm. An account is created for you
                to manage your booking.
              </p>
            </div>
            <label className="block">
              <span className="t-label mb-1.5 block">Full name</span>
              <input
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Alex Morgan"
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="t-label mb-1.5 block">Mobile number</span>
              <input
                className="field"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="07700 900123"
                inputMode="tel"
                autoComplete="tel"
              />
              {form.phone && !phoneOk && (
                <span className="t-caption mt-1 block text-error">Enter a valid mobile number.</span>
              )}
            </label>
            <label className="block">
              <span className="t-label mb-1.5 block">Email</span>
              <input
                className="field"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="alex@example.com"
                inputMode="email"
                autoComplete="email"
              />
              {form.email && !emailOk && (
                <span className="t-caption mt-1 block text-error">Enter a valid email address.</span>
              )}
            </label>
            <div className="flex items-start gap-2 rounded-input bg-teal-50 p-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" />
              <p className="t-caption text-teal-800">
                Your details are only shared with this provider for your booking. We never sell your data.
              </p>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <h2 className="t-h3">Review &amp; confirm</h2>

            <div className="card p-4">
              <p className="t-label mb-3">When</p>
              <p className="t-body-lg font-semibold">
                {relativeDay(date)}, {to12h(time!)}
              </p>
              <p className="t-caption text-grey-500">
                {formatDate(date)} · about {duration(totalMin)}
              </p>
            </div>

            <div className="card p-4">
              <p className="t-label mb-3">Services</p>
              <div className="space-y-2">
                {chosen.map((s) => (
                  <div key={s.id} className="flex justify-between">
                    <span className="t-body text-grey-700">{s.name}</span>
                    <span className="nums text-ink">{money(s.price)}</span>
                  </div>
                ))}
                <div className="my-2 h-px bg-grey-100" />
                <div className="flex justify-between">
                  <span className="t-label">Total</span>
                  <span className="nums text-[18px]">{money(total)}</span>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <p className="t-label mb-2">Your details</p>
              <p className="t-body text-grey-700">{form.name}</p>
              <p className="t-body text-grey-700">{form.phone}</p>
              <p className="t-body text-grey-700">{form.email}</p>
            </div>

            <div className="flex items-start gap-2 rounded-input bg-teal-50 p-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" />
              <p className="t-caption text-teal-800">
                You'll pay <span className="font-semibold">{provider.name}</span> directly. Fable+ never
                takes a cut and never holds your money. Free cancellation up to 12 hours before.
              </p>
            </div>
          </section>
        )}
      </div>

      {/* sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-grey-100 bg-white/95 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur">
        {selected.length > 0 && (
          <div className="mb-2 flex items-center justify-between">
            <span className="t-caption text-grey-500">
              {selected.length} {selected.length === 1 ? "service" : "services"} · {duration(totalMin)}
            </span>
            <span className="nums text-[18px]">{money(total)}</span>
          </div>
        )}
        <button type="button" disabled={!canNext} onClick={onNext} className="btn-primary w-full">
          {step === 3 ? "Confirm booking" : "Continue"}
        </button>
      </div>
    </div>
  );
}
