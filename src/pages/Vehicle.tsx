import { useState } from "react";
import { Car, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { api, ApiError } from "../lib/api";
import { useStore } from "../lib/store";

type Vehicle = Awaited<ReturnType<typeof api.vehicle>>;

export function Vehicle() {
  const { user } = useStore();
  const [reg, setReg] = useState("");
  const [data, setData] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function lookup() {
    setBusy(true);
    setErr(null);
    setData(null);
    try {
      setData(await api.vehicle(reg.trim()));
    } catch (e) {
      setErr(e instanceof ApiError ? (e.status === 401 ? "Sign in (Profile) to look up a vehicle." : e.message) : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  const statusUI = {
    valid: { icon: CheckCircle2, cls: "text-success", label: "MOT valid" },
    expired: { icon: AlertTriangle, cls: "text-error", label: "MOT expired" },
    unknown: { icon: HelpCircle, cls: "text-grey-500", label: "MOT status unknown" },
  };

  return (
    <div className="min-h-screen pb-12">
      <TopBar title="Vehicle check" />
      <div className="space-y-4 px-5 pt-3">
        <div className="relative overflow-hidden rounded-card bg-teal-gradient p-5 text-white shadow-float">
          <Car size={26} />
          <h1 className="t-h2 mt-2 text-white">Check your vehicle</h1>
          <p className="t-body mt-1 text-white/90">Enter your reg for make, model and MOT status (DVSA), then book the right clean.</p>
        </div>

        {!user && <p className="t-caption rounded-input bg-warning/10 p-3 text-warning">Sign in (Profile) to look up your vehicle.</p>}

        <div className="flex gap-2">
          <input
            className="field flex-1 text-center text-[20px] font-bold uppercase tracking-[0.2em]"
            placeholder="AB12 CDE"
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && reg.trim() && lookup()}
          />
          <button type="button" onClick={lookup} disabled={busy || reg.trim().length < 2} className="btn-primary px-5">
            {busy ? "…" : "Check"}
          </button>
        </div>
        {err && <p className="t-caption text-error">{err}</p>}

        {data && (
          <div className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <p className="t-h3">{data.make ?? "Vehicle"} {data.model ?? ""}</p>
              <span className="rounded-md bg-[#ffcd00] px-2 py-1 font-display text-[16px] font-bold tracking-wider text-ink">
                {data.registration}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 t-body text-grey-700">
              {data.colour && <p>Colour: <span className="text-ink">{data.colour}</span></p>}
              {data.fuelType && <p>Fuel: <span className="text-ink">{data.fuelType}</span></p>}
            </div>
            {(() => {
              const s = statusUI[data.motStatus];
              const Icon = s.icon;
              return (
                <div className="flex items-center gap-2">
                  <Icon size={18} className={s.cls} />
                  <span className={`t-label ${s.cls}`}>{s.label}</span>
                  {data.motExpiry && <span className="t-caption text-grey-500">· {data.motStatus === "valid" ? "until" : "since"} {data.motExpiry}</span>}
                </div>
              );
            })()}
            {data.advisories.length > 0 && (
              <div className="rounded-input bg-canvas p-3">
                <p className="t-caption mb-1 font-semibold text-grey-700">Latest advisories</p>
                <ul className="list-disc pl-4 t-caption text-grey-500">
                  {data.advisories.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            <p className="t-caption text-grey-400">Source: {data.source === "dvsa" ? "DVSA MOT history" : "sandbox (no DVSA credentials)"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
