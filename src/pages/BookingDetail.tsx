import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarCheck, Clock, MapPin, PartyPopper, Phone, ShieldCheck } from "lucide-react";
import { getProvider } from "../data/providers";
import { ImageTile } from "../components/ImageTile";
import { StatusBadge } from "../components/StatusBadge";
import { TopBar } from "../components/TopBar";
import { useStore } from "../lib/store";
import { duration, formatDate, money, relativeDay, to12h } from "../lib/format";
import { NotFound } from "./NotFound";

export function BookingDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const navigate = useNavigate();
  const { bookings, cancelBooking } = useStore();
  const booking = bookings.find((b) => b.id === id);

  if (!booking) return <NotFound />;
  const provider = getProvider(booking.providerSlug);

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
            Confirmation <span className="font-semibold tracking-wider">{booking.ref}</span> · we've texted{" "}
            {booking.customer.phone}
          </p>
        </div>
      )}

      <div className={`space-y-4 px-5 ${isNew ? "-mt-5" : "pt-4"}`}>
        {/* provider */}
        <div className="card flex items-center gap-3 p-4">
          <ImageTile seed={booking.providerSeed} className="h-14 w-14 shrink-0" rounded="rounded-input" />
          <div className="min-w-0 flex-1">
            <p className="t-label truncate">{booking.providerName}</p>
            {provider && (
              <p className="t-caption flex items-center gap-1 text-grey-500">
                <MapPin size={13} /> {provider.area}
              </p>
            )}
          </div>
          {!isNew && <StatusBadge status={booking.status} />}
        </div>

        {/* when */}
        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-100 text-teal-700">
              <CalendarCheck size={19} />
            </span>
            <div>
              <p className="t-label">
                {relativeDay(booking.date)}, {to12h(booking.time)}
              </p>
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

        {/* services */}
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

        <div className="flex items-start gap-2 rounded-input bg-teal-50 p-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" />
          <p className="t-caption text-teal-800">
            Pay the provider directly on the day. Fable+ takes no fee and never holds your money.
          </p>
        </div>

        {/* actions */}
        {booking.status === "confirmed" && (
          <div className="space-y-3 pt-1">
            <a href="tel:" className="btn-secondary w-full">
              <Phone size={18} /> Contact provider
            </a>
            <Link to={`/p/${booking.providerSlug}`} className="btn-primary w-full">
              View provider
            </Link>
            <button
              type="button"
              onClick={() => {
                if (confirm("Cancel this booking? This can't be undone.")) cancelBooking(booking.id);
              }}
              className="btn-destructive w-full"
            >
              Cancel booking
            </button>
          </div>
        )}

        {booking.status !== "confirmed" && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => navigate(`/p/${booking.providerSlug}/book`)}
              className="btn-primary w-full"
            >
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
