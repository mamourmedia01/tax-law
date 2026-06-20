import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Send, ChevronRight } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { api, ApiError } from "../lib/api";
import { useStore } from "../lib/store";

interface Msg {
  role: "you" | "fable";
  text: string;
  references?: { type: string; label: string; href: string }[];
}

const SUGGESTED = ["Find me the cheapest valet", "Best for interior cleaning", "When is my next booking?"];

export function Concierge() {
  const { user } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "fable", text: "Hi! I'm your Fable+ concierge. I can find trusted car care, compare prices, or look up your bookings — what are you after?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: "you", text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api.concierge(text);
      setMsgs((m) => [...m, { role: "fable", text: r.reply, references: r.references }]);
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 401 ? "Please sign in (Profile tab) so I can see your bookings." : "Sorry, I couldn't reach the concierge.";
      setMsgs((m) => [...m, { role: "fable", text: msg }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title="Concierge" />
      <div className="flex-1 space-y-3 px-5 pt-3 pb-40">
        {!user && (
          <p className="t-caption rounded-input bg-warning/10 p-3 text-warning">
            Tip: sign in (Profile) so the concierge can see your bookings.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "you" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] rounded-card p-3 ${m.role === "you" ? "bg-teal-700 text-white" : "bg-white shadow-card"}`}>
              {m.role === "fable" && (
                <p className="t-caption mb-1 flex items-center gap-1 text-teal-700">
                  <Sparkles size={13} /> Fable+ concierge
                </p>
              )}
              <p className="t-body">{m.text}</p>
              {m.references && m.references.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.references.map((r, j) => (
                    <Link key={j} to={r.href} className="focusable flex items-center justify-between rounded-input bg-canvas px-3 py-2 text-ink">
                      <span className="t-label">{r.label}</span>
                      <ChevronRight size={16} className="text-grey-400" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="t-caption text-grey-500">Thinking…</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-grey-100 bg-white/95 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur">
        <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
          {SUGGESTED.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} disabled={busy} className="chip focusable shrink-0">
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="field flex-1"
            placeholder="Ask the concierge…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
          />
          <button type="button" onClick={() => send(input)} disabled={busy} className="btn-primary px-4">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
