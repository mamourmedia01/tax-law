import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarCheck, CheckCircle2, Clock, CreditCard, PartyPopper, Phone, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ImageTile } from "../components/ImageTile";
import { StatusBadge } from "../components/StatusBadge";
import { TopBar } from "../components/TopBar";
import { ListSkeleton, ErrorState } from "../components/States";
import { duration, formatDate, money, relativeDay, to12h } from "../lib/format";
import { NotFound } from "./NotFound";

export function BookingDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const navigate = useNavigate();
  const { data: booking, loading, error, reload } = useAsync(() => api.booking(id!), [id]);

  const [payState, setPayState] = useState<"idle" | "busy" | "paid" | "inperson">("idle");
  const [payMsg, setPayMsg] = useState<string | null>(null);

  if (loading) return <ListSkeleton count={3} />;
  if (error?.code === "not_found") return <NotFound />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!booking) return <NotFound />;

  async function pay() {
    setPayState("busy");
    setPayMsg(null);
    try {
      const key = `${booking!.id}:${crypto.randomUUID()}`;
      const res = await api.payBooking(booking!.id, key);
      setPayState("paid");
      setPayMsg(`Authorised — settles directly to the provider (platform fee ${money(res.applicationFee)}).`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setPayState("inperson");
        setPayMsg("This provider takes payment in person only.");
      } else {
        setPayState("idle");
        setPayMsg(e instanceof ApiError ? e.message : "Payment failed");
      }
    }
  }

  async function cancel() {
    if (!confirm("Cancel this booking? This can't be undone.")) return;
    await api.cancelBooking(booking!.id).catch(() => {});
    reload();
  }

  return (
    <div className="min-h-screen pb-10">
      <TopBar title={isNew ? undefined : "Booking"} right={isNew ? undefined : <StatusBadge status={booking.status} />} />

      {isNew && (
        <div className="bg-teal-gradient px-6 pb-8 pt-4 text-center text-white">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-white/20">
            <PartyPopper size={30} />
          </div>
          <h1 className="t-h1 text-white">Gleaming.</h1>
          <p className="t-body-lg mt-1 text-white/90">Booking confirmed.</p>
          <p className="t-caption mt-2 text-white/80">
            Confirmation <span className="font-semibold tracking-wider">{booking.ref}</span>
          </p>
        </div>
      )}

      <div className={`space-y-4 px-5 ${isNew ? "-mt-5" : "pt-4"}`}>
        <div className="card flex items-center gap-3 p-4">
          <ImageTile seed={booking.providerSeed} className="h-14 w-14 shrink-0" rounded="rounded-input" />
          <div className="min-w-0 flex-1">
            <p className="t-label truncate">{booking.providerName}</p>
            <p className="t-caption text-grey-500">Ref {booking.ref}</p>
          </div>
          {!isNew && <StatusBadge status={booking.status} />}
        </div>

        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-100 text-teal-700">
              <CalendarCheck size={19} />
            </span>
            <div>
              <p className="t-label">{relativeDay(booking.date)}, {to12h(booking.time)}</p>
              <p className="t-caption text-grey-500">{formatDate(booking.date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-100 text-teal-700">
              <Clock size={19} />
            </span>
            <div>
              <p className="t-label">About {duration(booking.durationMin)}</p>
              <p className="t-caption text-grey-500">Estimated duration</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <p className="t-label mb-3">Services</p>
          <div className="space-y-2">
            {booking.serviceNames.map((n, i) => (
              <div key={i} className="flex justify-between">
                <span className="t-body text-grey-700">{n}</span>
              </div>
            ))}
            <div className="my-2 h-px bg-grey-100" />
            <div className="flex justify-between">
              <span className="t-label">Total (pay provider)</span>
              <span className="nums text-[18px]">{money(booking.total)}</span>
            </div>
          </div>
        </div>

        {payMsg && (
          <div className={`flex items-start gap-2 rounded-input p-3 ${payState === "paid" ? "bg-success/10" : "bg-teal-50"}`}>
            {payState === "paid" ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" />
            )}
            <p className={`t-caption ${payState === "paid" ? "text-success" : "text-teal-800"}`}>{payMsg}</p>
          </div>
        )}

        {booking.status === "confirmed" && (
          <div className="space-y-3 pt-1">
            {payState !== "paid" && (
              <button type="button" onClick={pay} disabled={payState === "busy"} className="btn-primary w-full">
                <CreditCard size={18} /> {payState === "busy" ? "Processing…" : `Pay in app · ${money(booking.total)}`}
              </button>
            )}
            <a href="tel:" className="btn-secondary w-full">
              <Phone size={18} /> Contact provider
            </a>
            <Link to={`/p/${booking.providerSlug}`} className="btn-tertiary mx-auto block w-fit">
              View provider
            </Link>
            <button type="button" onClick={cancel} className="btn-destructive w-full">
              Cancel booking
            </button>
          </div>
        )}

        {booking.status !== "confirmed" && (
          <div className="pt-1">
            <button type="button" onClick={() => navigate(`/p/${booking.providerSlug}/book`)} className="btn-primary w-full">
              Rebook
            </button>
          </div>
        )}

        {isNew && (
          <Link to="/bookings" className="btn-tertiary mx-auto mt-2 block w-fit">
            View all bookings
          </Link>
        )}
      </div>
    </div>
  );
}
