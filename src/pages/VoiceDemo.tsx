import { useState } from "react";
import { Mic, Phone, ShieldCheck, Volume2 } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { ApiError } from "../lib/api";

interface Turn {
  reply: string;
  intent: string;
  proposal?: { serviceName: string; price: number; date: string; time: string };
  audioBase64: string;
  voiceMode: string;
}

const SUGGESTED = ["Can I book a wash today?", "How much is a full valet?", "What services do you offer?"];

export function VoiceDemo() {
  const [message, setMessage] = useState("");
  const [turn, setTurn] = useState<Turn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/provider/voice/receptionist", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Failed");
      setTurn(data as Turn);
      // play the synthesized audio
      const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
      audio.play().catch(() => {});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the voice service");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen pb-12">
      <TopBar title="Voice receptionist" />
      <div className="space-y-4 px-5 pt-3">
        <div className="relative overflow-hidden rounded-card bg-teal-gradient p-5 text-white shadow-float">
          <Phone size={26} />
          <h1 className="t-h2 mt-2 text-white">AI Voice receptionist</h1>
          <p className="t-body mt-1 text-white/90">
            Powered by VibeVoice (FW32). Grounded in your real services &amp; availability. It can
            propose a booking — you always confirm. It never takes payment.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} disabled={busy} className="chip focusable">
              {s}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className="field flex-1"
            placeholder="Ask the receptionist…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && message.trim() && send(message)}
          />
          <button type="button" onClick={() => message.trim() && send(message)} disabled={busy} className="btn-primary px-4">
            <Mic size={18} />
          </button>
        </div>

        {error && (
          <div className="card p-4">
            <p className="t-label mb-1 text-error">Unavailable</p>
            <p className="t-caption text-grey-500">{error} (Voice AI is a Fleet-plan feature — sign in as a Fleet provider, e.g. gleamworks-detailing@provider.fableplus.)</p>
          </div>
        )}

        {turn && (
          <div className="card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-100 text-teal-700">
                <Volume2 size={18} />
              </span>
              <div>
                <p className="t-label">Receptionist</p>
                <p className="t-caption text-grey-500">
                  intent: {turn.intent} · voice: {turn.voiceMode}
                </p>
              </div>
            </div>
            <p className="t-body-lg text-ink">“{turn.reply}”</p>
            {turn.proposal && (
              <div className="rounded-input border border-teal-200 bg-teal-50 p-3">
                <p className="t-label text-teal-800">Proposed booking (awaiting your approval)</p>
                <p className="t-caption mt-1 text-teal-800">
                  {turn.proposal.serviceName} · {turn.proposal.date} at {turn.proposal.time} · £{turn.proposal.price}
                </p>
              </div>
            )}
            <div className="flex items-start gap-2 rounded-input bg-grey-100 p-3">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-grey-500" />
              <p className="t-caption text-grey-500">
                The AI suggests only — it created no booking and moved no money. A human approves every action.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
