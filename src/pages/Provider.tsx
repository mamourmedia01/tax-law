import { Link, useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, Heart, MapPin, Share2, Clock } from "lucide-react";
import { getProvider } from "../data/providers";
import { ImageTile } from "../components/ImageTile";
import { Reveal } from "../components/Reveal";
import { Stars } from "../components/Stars";
import { TopBar } from "../components/TopBar";
import { useStore } from "../lib/store";
import { duration, money } from "../lib/format";
import { NotFound } from "./NotFound";

export function ProviderPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { favourites, toggleFavourite } = useStore();
  const provider = slug ? getProvider(slug) : undefined;

  if (!provider) return <NotFound />;
  const fav = favourites.includes(provider.id);

  return (
    <div className="pb-28">
      {/* hero */}
      <div className="relative">
        <ImageTile seed={provider.seed} className="h-60 w-full" rounded="rounded-none" label={provider.name} />
        <div className="absolute inset-x-0 top-0">
          <TopBar
            transparent
            right={
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="Share"
                  className="focusable grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur"
                >
                  <Share2 size={19} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavourite(provider.id)}
                  aria-pressed={fav}
                  aria-label={fav ? "Remove from saved" : "Save provider"}
                  className="focusable grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur"
                >
                  <Heart size={19} className={fav ? "fill-error text-error" : ""} />
                </button>
              </div>
            }
          />
        </div>
      </div>

      {/* identity card overlapping hero */}
      <div className="relative -mt-8 px-5">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="t-h2">{provider.name}</h1>
                {provider.verified && <BadgeCheck size={20} className="text-teal-600" aria-label="Verified" />}
              </div>
              <p className="t-body mt-0.5 text-grey-700">{provider.tagline}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Stars rating={provider.rating} count={provider.reviewCount} />
            <span className="t-caption flex items-center gap-1 text-grey-500">
              <MapPin size={14} /> {provider.area} · {provider.distanceKm} km
            </span>
            <span className="t-caption flex items-center gap-1 text-grey-500">
              <Clock size={14} /> Next: {provider.nextSlot}
            </span>
          </div>
        </div>
      </div>

      {/* about */}
      <section className="px-5 pt-6">
        <h2 className="t-h3 mb-2">About</h2>
        <p className="t-body text-grey-700">{provider.about}</p>
      </section>

      {/* services */}
      <section className="px-5 pt-6">
        <h2 className="t-h3 mb-3">Services</h2>
        <div className="space-y-3">
          {provider.services.map((s) => (
            <div key={s.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="t-label">{s.name}</p>
                <p className="t-caption mt-0.5 text-grey-500">{s.description}</p>
                <p className="t-caption mt-1.5 flex items-center gap-1 text-grey-500">
                  <Clock size={13} /> {duration(s.durationMin)} · <span className="nums text-ink">{money(s.price)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/p/${provider.slug}/book`, { state: { serviceId: s.id } })}
                className="btn-secondary h-10 shrink-0 px-4 text-[14px]"
              >
                Book
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* reveals */}
      <section className="pt-7">
        <h2 className="t-h3 mb-1 px-5">The Reveal</h2>
        <p className="t-caption mb-3 px-5 text-grey-500">Drag to see before &amp; after — real work from {provider.name.split(" ")[0]}.</p>
        <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-5 pb-2">
          {provider.gallery.map((g) => (
            <div key={g.id} className="w-64 shrink-0">
              <Reveal before={g.before} after={g.after} label={g.label} className="h-40 w-full" />
              <p className="t-caption mt-1.5 text-grey-500">{g.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* reviews */}
      <section className="px-5 pt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="t-h3">Reviews</h2>
          <Stars rating={provider.rating} count={provider.reviewCount} />
        </div>
        <div className="space-y-3">
          {provider.reviews.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="t-label">{r.author}</p>
                <Stars rating={r.rating} />
              </div>
              <p className="t-body mt-1.5 text-grey-700">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-grey-100 bg-white/95 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <p className="t-caption text-grey-500">From</p>
            <p className="nums text-[18px] text-ink">{money(provider.priceFrom)}</p>
          </div>
          <Link to={`/p/${provider.slug}/book`} className="btn-primary flex-1">
            Book now
          </Link>
        </div>
      </div>
    </div>
  );
}
