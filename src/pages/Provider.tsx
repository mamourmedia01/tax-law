import { Link, useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, Heart, MapPin, Share2, Clock } from "lucide-react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ImageTile } from "../components/ImageTile";
import { Reveal } from "../components/Reveal";
import { Stars } from "../components/Stars";
import { TopBar } from "../components/TopBar";
import { ErrorState } from "../components/States";
import { useStore } from "../lib/store";
import { duration, money } from "../lib/format";
import { NotFound } from "./NotFound";

export function ProviderPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { favourites, toggleFavourite } = useStore();
  const { data: provider, loading, error, reload } = useAsync(() => api.provider(slug!), [slug]);

  if (loading) {
    return (
      <div>
        <div className="skeleton h-60 w-full rounded-none" />
        <div className="space-y-3 p-5">
          <div className="skeleton h-6 w-1/2" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
    );
  }
  if (error) {
    if (error.code === "not_found") return <NotFound />;
    return (
      <div>
        <TopBar title="Provider" />
        <div className="px-5">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    );
  }
  if (!provider) return <NotFound />;
  const fav = favourites.includes(provider.id);

  // FW29: the storefront renders from the provider's own theme tokens (data, not code).
  const primary = provider.theme["brand.primary"] ?? "#3C6A75";
  const onPrimary = provider.theme["brand.onPrimary"] ?? "#FFFFFF";
  const themed = primary.toLowerCase() !== "#3c6a75";

  return (
    <div className="pb-28">
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
                  onClick={async () => {
                    const url = `${window.location.origin}/p/${provider.slug}`;
                    const card = `/api/providers/${provider.slug}/share-card.svg`;
                    if (navigator.share) {
                      await navigator.share({ title: provider.name, text: provider.tagline, url }).catch(() => {});
                    } else {
                      window.open(card, "_blank");
                    }
                  }}
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

      <div className="relative -mt-8 px-5">
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <h1 className="t-h2">{provider.name}</h1>
            {provider.verified && <BadgeCheck size={20} className="text-teal-600" aria-label="Verified" />}
          </div>
          <p className="t-body mt-0.5 text-grey-700">{provider.tagline}</p>
          {themed && (
            <span
              className="badge mt-2"
              style={{ backgroundColor: `${primary}1A`, color: primary }}
            >
              Custom storefront
            </span>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Stars rating={provider.rating} count={provider.reviewCount} />
            <span className="t-caption flex items-center gap-1 text-grey-500">
              <MapPin size={14} /> {provider.area} · {provider.distanceKm} km
            </span>
            <span className="t-caption flex items-center gap-1 text-grey-500">
              <Clock size={14} /> Next: {provider.nextSlot}
            </span>
          </div>
          {!provider.verified && (
            <p className="t-caption mt-3 rounded-input bg-warning/10 p-2 text-warning">
              This provider takes payment in person only (not yet verified for in-app payments).
            </p>
          )}
        </div>
      </div>

      <section className="px-5 pt-6">
        <h2 className="t-h3 mb-2">About</h2>
        <p className="t-body text-grey-700">{provider.about}</p>
      </section>

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
                className="btn h-10 shrink-0 border-[1.5px] bg-white px-4 text-[14px]"
                style={{ color: primary, borderColor: primary }}
              >
                Book
              </button>
            </div>
          ))}
        </div>
      </section>

      {(provider.packages.length > 0 || provider.memberships.length > 0) && (
        <section className="px-5 pt-7">
          <h2 className="t-h3 mb-3">Packages &amp; memberships</h2>
          <div className="space-y-3">
            {provider.packages.map((p) => (
              <div key={p.id} className="card flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="t-label">{p.name}</p>
                  <p className="t-caption text-grey-500">{p.credits} visits{p.description ? ` · ${p.description}` : ""}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.purchasePackage(p.id);
                      alert(`Purchased ${p.name} — ${p.credits} credits added.`);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Please sign in to buy");
                    }
                  }}
                  className="btn h-10 shrink-0 px-4 text-[14px]"
                  style={{ backgroundColor: primary, color: onPrimary }}
                >
                  {money(p.price)}
                </button>
              </div>
            ))}
            {provider.memberships.map((m) => (
              <div key={m.id} className="card flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="t-label">{m.name}</p>
                  <p className="t-caption text-grey-500">Membership{m.description ? ` · ${m.description}` : ""}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.joinMembership(m.id);
                      alert(`Joined ${m.name}.`);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Please sign in to join");
                    }
                  }}
                  className="btn-secondary h-10 shrink-0 px-4 text-[14px]"
                >
                  {money(m.monthlyPrice)}/mo
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {provider.gallery.length > 0 && (
        <section className="pt-7">
          <h2 className="t-h3 mb-1 px-5">The Reveal</h2>
          <p className="t-caption mb-3 px-5 text-grey-500">
            Drag to see before &amp; after — real work from {provider.name.split(" ")[0]}.
          </p>
          <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-5 pb-2">
            {provider.gallery.map((g) => (
              <div key={g.id} className="w-64 shrink-0">
                <Reveal before={g.before} after={g.after} label={g.label} className="h-40 w-full" />
                <p className="t-caption mt-1.5 text-grey-500">{g.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

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

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-grey-100 bg-white/95 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur">
        {provider.marketplaceFull && (
          <p className="t-caption mb-2 rounded-input bg-warning/10 p-2 text-center text-warning">
            Fully booked for new customers this month — existing clients can still book.
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <p className="t-caption text-grey-500">From</p>
            <p className="nums text-[18px] text-ink">{money(provider.priceFrom)}</p>
          </div>
          <Link
            to={`/p/${provider.slug}/book`}
            className="btn flex-1"
            style={{ backgroundColor: primary, color: onPrimary }}
          >
            Book now
          </Link>
        </div>
      </div>
    </div>
  );
}
