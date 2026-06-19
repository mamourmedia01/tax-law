import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus } from "lucide-react";
import { api, type Booking } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ImageTile } from "../components/ImageTile";
import { StatusBadge } from "../components/StatusBadge";
import { ListSkeleton, ErrorState } from "../components/States";
import { useStore } from "../lib/store";
import { money, parseIso, relativeDay, to12h } from "../lib/format";

function isUpcoming(b: Booking): boolean {
  if (b.status !== "confirmed") return false;
  const when = parseIso(b.date);
  const today = new Date();
  return when.getTime() >= new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

function Row({ b }: { b: Booking }) {
  return (
    <Link to={`/booking/${b.id}`} className="card focusable flex animate-fade-up items-center gap-3 p-3">
      <ImageTile seed={b.providerSeed} className="h-16 w-16 shrink-0" rounded="rounded-input" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="t-label truncate">{b.providerName}</p>
          <StatusBadge status={b.status} />
        </div>
        <p className="t-caption mt-0.5 truncate text-grey-500">{b.serviceNames.join(", ")}</p>
        <p className="t-caption mt-1 text-grey-500">
          {relativeDay(b.date)} · {to12h(b.time)} · <span className="nums text-ink">{money(b.total)}</span>
        </p>
      </div>
    </Link>
  );
}

export function Bookings() {
  const { user } = useStore();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const { data, loading, error, reload } = useAsync(() => (user ? api.bookings() : Promise.resolve([])), [user?.id]);

  const bookings = data ?? [];
  const upcoming = bookings.filter(isUpcoming);
  const past = bookings.filter((b) => !isUpcoming(b));
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="animate-fade-up">
      <div className="px-5 pb-3 pt-4">
        <h1 className="t-h1">Bookings</h1>
      </div>

      {!user && !loading ? (
        <div className="px-5">
          <div className="card mt-4 flex flex-col items-center p-8 text-center">
            <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-teal-100 text-teal-700">
              <CalendarPlus size={26} />
            </span>
            <p className="t-h3 mb-1">No bookings yet</p>
            <p className="t-body mb-4 text-grey-500">Book your first wash — no account needed to start.</p>
            <Link to="/search" className="btn-primary px-6">
              Find a provider
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="px-5">
            <div className="flex rounded-full bg-grey-100 p-1">
              {(["upcoming", "past"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={`focusable flex-1 rounded-full py-2 text-[14px] font-medium capitalize transition-colors ${
                    tab === t ? "bg-white text-ink shadow-card" : "text-grey-500"
                  }`}
                >
                  {t} {t === "upcoming" && upcoming.length > 0 && `(${upcoming.length})`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 px-5 pt-4">
            {loading && <ListSkeleton />}
            {error && <ErrorState error={error} onRetry={reload} />}
            {list.map((b) => (
              <Row key={b.id} b={b} />
            ))}
            {!loading && !error && list.length === 0 && (
              <div className="card mt-6 flex flex-col items-center p-8 text-center">
                <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-teal-100 text-teal-700">
                  <CalendarPlus size={26} />
                </span>
                <p className="t-h3 mb-1">{tab === "upcoming" ? "No upcoming bookings" : "No past bookings yet"}</p>
                <p className="t-body mb-4 text-grey-500">
                  {tab === "upcoming" ? "Find a trusted provider and book your next wash." : "Your completed and cancelled bookings will show here."}
                </p>
                <Link to="/search" className="btn-primary px-6">
                  Find a provider
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
