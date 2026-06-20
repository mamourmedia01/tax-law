import { useState } from "react";
import { Car, Plus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { api, ApiError } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ListSkeleton, ErrorState } from "../components/States";
import { useStore } from "../lib/store";

export function Garage() {
  const { user } = useStore();
  const g = useAsync(() => (user ? api.garage() : Promise.resolve([])), [user?.id]);
  const [reg, setReg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      await api.addVehicle(reg.trim());
      setReg("");
      g.reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not add vehicle");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await api.removeVehicle(id).catch(() => {});
    g.reload();
  }

  return (
    <div className="min-h-screen pb-12">
      <TopBar title="My Garage" />
      <div className="space-y-4 px-5 pt-3">
        <p className="t-body text-grey-700">Save your vehicles for one-tap booking with the right size & price.</p>

        {!user ? (
          <p className="t-caption rounded-input bg-warning/10 p-3 text-warning">Sign in (Profile) to manage your garage.</p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className="field flex-1 text-center font-bold uppercase tracking-[0.2em]"
                placeholder="AB12 CDE"
                value={reg}
                onChange={(e) => setReg(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && reg.trim() && add()}
              />
              <button type="button" onClick={add} disabled={busy || reg.trim().length < 2} className="btn-primary px-5">
                <Plus size={18} />
              </button>
            </div>
            {err && <p className="t-caption text-error">{err}</p>}

            {g.loading && <ListSkeleton count={2} />}
            {g.error && <ErrorState error={g.error} onRetry={g.reload} />}
            <div className="space-y-3">
              {(g.data ?? []).map((v) => (
                <div key={v.id} className="card flex items-center gap-3 p-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700">
                    <Car size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[#ffcd00] px-2 py-0.5 font-display text-[14px] font-bold tracking-wider text-ink">{v.reg}</span>
                      <span className="t-label truncate">{[v.colour, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}</span>
                    </div>
                    {v.motStatus && (
                      <p className={`t-caption mt-1 flex items-center gap-1 ${v.motStatus === "valid" ? "text-success" : "text-error"}`}>
                        {v.motStatus === "valid" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                        MOT {v.motStatus}{v.motExpiry ? ` · ${v.motExpiry}` : ""}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => remove(v.id)} aria-label="Remove" className="focusable grid h-9 w-9 place-items-center rounded-full text-grey-400 hover:bg-error/10 hover:text-error">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              {!g.loading && (g.data ?? []).length === 0 && (
                <div className="card p-8 text-center">
                  <p className="t-h3 mb-1">No vehicles yet</p>
                  <p className="t-body text-grey-500">Add your reg above to get started.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
