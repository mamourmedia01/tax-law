import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, Check, Clock, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ImageTile } from "../components/ImageTile";
import { TopBar } from "../components/TopBar";
import { ListSkeleton, ErrorState } from "../components/States";
import { useStore } from "../lib/store";
import { duration, formatDate, isoDate, money, relativeDay, to12h } from "../lib/format";
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

export function BookingFlow() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser, refreshMe } = useStore();
  const { data: provider, loading, error, reload } = useAsync(() => api.provider(slug!), [slug]);

  const preselect = (location.state as { serviceId?: string } | null)?.serviceId;
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(preselect ? [preselect] : []);
  const days = useMemo(() => nextDays(14), []);
  const [date, setDate] = useState<string>(isoDate(days[0]));
  const [time, setTime] = useState<string | null>(null);

  // guest checkout / OTP state
  const [form, setForm] = useState({ name: "", contact: "", marketing: false });
  const [otpStage, setOtpStage] = useState<"form" | "code">("form");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // DVSA vehicle capture (optional)
  const [reg, setReg] = useState("");
  const [vehicleDesc, setVehicleDesc] = useState<string | null>(null);
  const [vehBusy, setVehBusy] = useState(false);
  const [vehErr, setVehErr] = useState<string | null>(null);

  const slots = useAsync(() => api.availability(slug!, date), [slug, date]);

  if (loading) return <ListSkeleton count={3} />;
  if (error?.code === "not_found") return <NotFound />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!provider) return <NotFound />;

  const chosen = provider.services.filter((s) => selected.includes(s.id));
  const total = chosen.reduce((sum, s) => sum + s.price, 0);
  const totalMin = chosen.reduce((sum, s) => sum + s.durationMin, 0);
  const identified = !!user; // signed in (guest or claimed) => OTP cleared

  const canNext =
    (step === 0 && selected.length > 0) ||
    (step === 1 && !!time) ||
    (step === 2 && identified) ||
    step === 3;

  function toggle(serviceId: string) {
    setSelected((s) => (s.includes(serviceId) ? s.filter((x) => x !== serviceId) : [...s, serviceId]));
  }

  async function sendCode() {
    setAuthErr(null);
    setAuthBusy(true);
    try {
      const { devCode } = await api.requestOtp(form.contact.trim());
      setDevCode(devCode ?? null);
      setOtpStage("code");
    } catch (e) {
      setAuthErr(e instanceof ApiError ? e.message : "Could not send code");
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyCode() {
    setAuthErr(null);
    setAuthBusy(true);
    try {
      const { user } = await api.verifyOtp(form.contact.trim(), code.trim());
      // claim the account with the name + marketing preference
      const updated = await api.updateAccount({ name: form.name.trim(), marketing_consent: form.marketing });
      setUser(updated.user ?? user);
      await refreshMe();
    } catch (e) {
      setAuthErr(e instanceof ApiError ? e.message : "Incorrect code");
    } finally {
      setAuthBusy(false);
    }
  }

  async function confirm() {
    if (!time) return;
    setSubmitErr(null);
    setSubmitting(true);
    try {
      const booking = await api.createBooking({
        providerSlug: provider!.slug,
        serviceIds: chosen.map((s) => s.id),
        date,
        time,
        vehicleReg: reg.trim() ? reg.trim().toUpperCase() : undefined,
        vehicleDesc: vehicleDesc ?? undefined,
      });
      navigate(`/booking/${booking.id}?new=1`, { replace: true });
    } catch (e) {
      setSubmitErr(e instanceof ApiError ? e.message : "Could not confirm booking");
      if (e instanceof ApiError && e.code === "slot_taken") {
        setStep(1);
        setTime(null);
        slots.reload();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function checkVehicle() {
    setVehErr(null);
    setVehBusy(true);
    setVehicleDesc(null);
    try {
      const v = await api.vehicle(reg.trim());
      const desc = [v.colour, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
      const mot = v.motStatus === "valid" ? `MOT valid${v.motExpiry ? ` to ${v.motExpiry}` : ""}` : v.motStatus === "expired" ? "MOT expired" : "MOT unknown";
      setVehicleDesc(`${desc} · ${mot}`);
    } catch (e) {
      setVehErr(e instanceof ApiError ? e.message : "Could not look up that reg");
    } finally {
      setVehBusy(false);
    }
  }

  function onNext() {
    if (step < 3) setStep((s) => s + 1);
    else confirm();
  }

  return (
    <div className="min-h-screen pb-32">
      <TopBar title="Book" />

      <div className="px-5 pt-3">
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col gap-1.5">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-teal-600" : "bg-grey-200"}`} />
              <span className={`text-[11px] ${i === step ? "font-semibold text-teal-800" : "text-grey-400"}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>

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

      <div key={step} className="animate-fade-up px-5 pt-5">
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
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${on ? "border-teal-600 bg-teal-600 text-white" : "border-grey-200"}`}>
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
                    <span className="text-[11px] uppercase">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}</span>
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
            {slots.loading && (
              <div className="grid grid-cols-3 gap-2.5">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="skeleton h-12 rounded-input" />
                ))}
              </div>
            )}
            {slots.error && <ErrorState error={slots.error} onRetry={slots.reload} />}
            {slots.data && (
              <div className="grid grid-cols-3 gap-2.5">
                {slots.data.map((sl) => (
                  <button
                    key={sl.time}
                    type="button"
                    disabled={!sl.available}
                    onClick={() => setTime(sl.time)}
                    aria-pressed={time === sl.time}
                    className={`focusable h-12 rounded-input border text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:border-grey-100 disabled:bg-grey-100 disabled:text-grey-400 ${
                      time === sl.time ? "border-teal-700 bg-teal-700 text-white" : "border-grey-200 bg-white text-ink hover:border-teal-400"
                    }`}
                  >
                    {to12h(sl.time)}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <h2 className="t-h3">Your details</h2>
            {identified ? (
              <div className="card p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-success" />
                  <p className="t-label">You're verified</p>
                </div>
                <p className="t-caption mt-1 text-grey-500">
                  Booking as {user!.name || user!.email || user!.phone}. We'll text booking updates.
                </p>
              </div>
            ) : otpStage === "form" ? (
              <>
                <p className="t-caption text-grey-500">
                  No account needed — we'll send a one-time code to confirm it's you. An account is created for you to manage the booking.
                </p>
                <label className="block">
                  <span className="t-label mb-1.5 block">Full name</span>
                  <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Morgan" autoComplete="name" />
                </label>
                <label className="block">
                  <span className="t-label mb-1.5 block">Mobile or email</span>
                  <input
                    className="field"
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    placeholder="07700 900123 or alex@example.com"
                    autoComplete="email"
                  />
                </label>
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={form.marketing}
                    onChange={(e) => setForm({ ...form, marketing: e.target.checked })}
                    className="mt-1 h-4 w-4 accent-teal-700"
                  />
                  <span className="t-caption text-grey-500">
                    Send me offers and rebook reminders (optional — separate from booking updates, unsubscribe anytime).
                  </span>
                </label>
                {authErr && <p className="t-caption text-error">{authErr}</p>}
                <button
                  type="button"
                  disabled={authBusy || form.name.trim().length < 2 || form.contact.trim().length < 5}
                  onClick={sendCode}
                  className="btn-primary w-full"
                >
                  {authBusy ? "Sending…" : "Send code"}
                </button>
              </>
            ) : (
              <>
                <p className="t-body text-grey-700">
                  Enter the 6-digit code we sent to <span className="font-semibold">{form.contact}</span>.
                </p>
                {devCode && (
                  <p className="t-caption rounded-input bg-teal-50 p-2 text-teal-800">
                    Sandbox: your code is <span className="font-semibold tracking-widest">{devCode}</span>
                  </p>
                )}
                <input
                  className="field text-center text-[22px] tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="••••••"
                  aria-label="One-time code"
                />
                {authErr && <p className="t-caption text-error">{authErr}</p>}
                <button type="button" disabled={authBusy || code.length !== 6} onClick={verifyCode} className="btn-primary w-full">
                  {authBusy ? "Verifying…" : "Verify & continue"}
                </button>
                <button type="button" onClick={() => setOtpStage("form")} className="btn-tertiary mx-auto block">
                  Change details
                </button>
              </>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <h2 className="t-h3">Review &amp; confirm</h2>
            <div className="card p-4">
              <p className="t-label mb-3">When</p>
              <p className="t-body-lg font-semibold">{relativeDay(date)}, {to12h(time!)}</p>
              <p className="t-caption text-grey-500">{formatDate(date)} · about {duration(totalMin)}</p>
            </div>
            <div className="card p-4">
              <p className="t-label mb-1">Your vehicle <span className="t-caption font-normal text-grey-400">· optional</span></p>
              <p className="t-caption mb-2 text-grey-500">Add your reg so {provider.name.split(" ")[0]} knows what they're cleaning.</p>
              <div className="flex gap-2">
                <input
                  className="field flex-1 text-center font-bold uppercase tracking-[0.2em]"
                  placeholder="AB12 CDE"
                  value={reg}
                  onChange={(e) => {
                    setReg(e.target.value.toUpperCase());
                    setVehicleDesc(null);
                  }}
                />
                <button type="button" onClick={checkVehicle} disabled={vehBusy || reg.trim().length < 2} className="btn-secondary px-4">
                  {vehBusy ? "…" : "Check"}
                </button>
              </div>
              {vehErr && <p className="t-caption mt-1.5 text-error">{vehErr}</p>}
              {vehicleDesc && <p className="t-caption mt-2 rounded-input bg-teal-50 p-2 text-teal-800">{vehicleDesc}</p>}
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
            <div className="flex items-start gap-2 rounded-input bg-teal-50 p-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" />
              <p className="t-caption text-teal-800">
                You'll pay <span className="font-semibold">{provider.name}</span> directly. Fable+ never takes a cut and never holds your money. Free cancellation up to 12 hours before.
              </p>
            </div>
            {submitErr && <p className="t-caption text-error">{submitErr}</p>}
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-grey-100 bg-white/95 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur">
        {selected.length > 0 && (
          <div className="mb-2 flex items-center justify-between">
            <span className="t-caption text-grey-500">
              {selected.length} {selected.length === 1 ? "service" : "services"} · {duration(totalMin)}
            </span>
            <span className="nums text-[18px]">{money(total)}</span>
          </div>
        )}
        {/* On the details step the inline buttons drive auth; hide the footer CTA until identified */}
        {!(step === 2 && !identified) && (
          <button type="button" disabled={!canNext || submitting} onClick={onNext} className="btn-primary w-full">
            {step === 3 ? (submitting ? "Confirming…" : "Confirm booking") : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}
