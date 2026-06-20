import { useState } from "react";
import { Truck, CheckCircle2 } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { api, ApiError } from "../lib/api";

export function Business() {
  const [form, setForm] = useState({ name: "", email: "", company: "", fleetSize: "", message: "" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = form.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.b2bEnquiry({
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim() || undefined,
        fleetSize: form.fleetSize ? Number(form.fleetSize) : undefined,
        message: form.message.trim() || undefined,
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not send — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen pb-12">
      <TopBar title="Fleet & business" />
      <div className="space-y-4 px-5 pt-3">
        <div className="relative overflow-hidden rounded-card bg-teal-gradient p-5 text-white shadow-float">
          <Truck size={26} />
          <h1 className="t-h2 mt-2 text-white">Keep your fleet gleaming</h1>
          <p className="t-body mt-1 text-white/90">Scheduled cleaning across your vehicles, one invoice, out-of-hours options. Tell us about your fleet.</p>
        </div>

        {done ? (
          <div className="card flex flex-col items-center p-8 text-center">
            <CheckCircle2 size={40} className="mb-3 text-success" />
            <p className="t-h3 mb-1">Thanks — we've got it</p>
            <p className="t-body text-grey-500">Our B2B team will be in touch within one working day.</p>
          </div>
        ) : (
          <div className="card space-y-3 p-5">
            <input className="field" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="field" placeholder="Work email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="field" placeholder="Company (optional)" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <input className="field" placeholder="Fleet size (optional)" inputMode="numeric" value={form.fleetSize} onChange={(e) => setForm({ ...form, fleetSize: e.target.value.replace(/\D/g, "") })} />
            <textarea className="field h-24 py-3" placeholder="Anything else? (optional)" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            {err && <p className="t-caption text-error">{err}</p>}
            <button type="button" onClick={submit} disabled={!valid || busy} className="btn-primary w-full">
              {busy ? "Sending…" : "Request a fleet quote"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
