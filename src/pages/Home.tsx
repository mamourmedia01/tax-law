import { Link, useNavigate } from "react-router-dom";
import { Bell, Search as SearchIcon, Sparkles } from "lucide-react";
import { CATEGORIES } from "../lib/constants";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ProviderCard } from "../components/ProviderCard";
import { Mark } from "../components/Mark";
import { ImageTile } from "../components/ImageTile";
import { Stars } from "../components/Stars";
import { ListSkeleton, ErrorState } from "../components/States";
import { useStore } from "../lib/store";
import { money, relativeDay, to12h } from "../lib/format";

export function Home() {
  const navigate = useNavigate();
  const { user } = useStore();
  const providers = useAsync(() => api.providers({ sort: "rating" }), []);
  const bookings = useAsync(() => (user ? api.bookings() : Promise.resolve([])), [user?.id]);
  const seasonal = useAsync(() => api.seasonal(), []);

  const recommended = providers.data?.slice(0, 4) ?? [];
  const topRated = providers.data?.slice(0, 6) ?? [];
  const upcoming = bookings.data?.find((b) => b.status === "confirmed");

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <Mark size={36} />
          <div>
            <p className="t-caption text-grey-500">
              {user?.name ? `Hi ${user.name.split(" ")[0]} 👋` : "Welcome to"}
            </p>
            <p className="font-display text-[18px] font-bold leading-tight">
              Fable<span className="text-teal-600">+</span>
            </p>
          </div>
        </div>
        <Link
          to="/notifications"
          aria-label="Notifications"
          className="focusable relative grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-card"
        >
          <Bell size={20} />
          {upcoming && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-error" />}
        </Link>
      </div>

      <div className="flex gap-2 px-5">
        <button
          type="button"
          onClick={() => navigate("/search")}
          className="focusable flex h-[52px] flex-1 items-center gap-3 rounded-2xl bg-white px-4 text-left shadow-card"
        >
          <SearchIcon size={20} className="text-grey-400" />
          <span className="t-body text-grey-400">Search valets, detailers…</span>
        </button>
        <Link
          to="/concierge"
          aria-label="Ask the Fable+ concierge"
          className="focusable grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl bg-teal-gradient text-white shadow-card"
        >
          <Sparkles size={20} />
        </Link>
      </div>

      <div className="px-5 pt-4">
        <div className="relative overflow-hidden rounded-card bg-teal-gradient p-5 text-white shadow-float">
          <div className="relative z-10 max-w-[78%]">
            <span className="badge bg-white/20 text-white">
              <Sparkles size={13} /> No platform fees, ever
            </span>
            <h2 className="t-h2 mt-3 text-white">Dirty to gleaming, at your door.</h2>
            <p className="t-body mt-1 text-white/90">
              Book trusted mobile car care near you. Pay the provider directly — we never take a cut.
            </p>
            <Link to="/search" className="btn mt-4 bg-white text-teal-800 hover:bg-teal-50">
              Find a provider
            </Link>
          </div>
          <Mark size={150} className="absolute -bottom-8 -right-6 opacity-20" />
        </div>
      </div>

      {upcoming && (
        <div className="px-5 pt-5">
          <h3 className="t-h3 mb-2">Your next booking</h3>
          <Link to={`/booking/${upcoming.id}`} className="card focusable flex items-center gap-3 p-3">
            <ImageTile seed={upcoming.providerSeed} className="h-14 w-14 shrink-0" rounded="rounded-input" />
            <div className="min-w-0 flex-1">
              <p className="t-label truncate">{upcoming.providerName}</p>
              <p className="t-caption text-grey-500">
                {relativeDay(upcoming.date)} · {to12h(upcoming.time)}
              </p>
            </div>
            <span className="badge">{money(upcoming.total)}</span>
          </Link>
        </div>
      )}

      {seasonal.data && (
        <div className="px-5 pt-5">
          <Link
            to={`/search?cat=${encodeURIComponent(seasonal.data.campaign.pushCategories[0])}`}
            className="card focusable flex items-center gap-3 border border-teal-100 bg-teal-50 p-4"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-gradient text-white">
              <Sparkles size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="t-label text-teal-800">{seasonal.data.campaign.title}</p>
              <p className="t-caption text-teal-700">{seasonal.data.campaign.blurb}</p>
            </div>
          </Link>
        </div>
      )}

      <div className="pt-6">
        <h3 className="t-h3 mb-3 px-5">Browse by service</h3>
        <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-5 pb-1">
          {CATEGORIES.map((c) => (
            <Link key={c.label} to={`/search?cat=${encodeURIComponent(c.label)}`} className="chip focusable shrink-0 py-2.5">
              <span aria-hidden>{c.emoji}</span>
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-4 px-5 pt-6">
        <div className="flex items-center justify-between">
          <h3 className="t-h3">Recommended near you</h3>
          <Link to="/search" className="t-label text-teal-700">
            See all
          </Link>
        </div>
        {providers.loading && <ListSkeleton count={2} />}
        {providers.error && <ErrorState error={providers.error} onRetry={providers.reload} />}
        {recommended.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}
      </div>

      {topRated.length > 0 && (
        <div className="pt-7">
          <h3 className="t-h3 mb-3 px-5">Top rated this week</h3>
          <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-5 pb-2">
            {topRated.map((p) => (
              <Link key={p.id} to={`/p/${p.slug}`} className="card focusable w-44 shrink-0 overflow-hidden">
                <ImageTile seed={p.seed} className="h-28 w-full" rounded="rounded-none" label={p.name} />
                <div className="space-y-1 p-3">
                  <p className="t-label truncate">{p.name}</p>
                  <Stars rating={p.rating} count={p.reviewCount} />
                  <p className="t-caption text-grey-500">from {money(p.priceFrom)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
