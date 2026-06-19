import { Link } from "react-router-dom";
import { BadgeCheck, Heart, MapPin } from "lucide-react";
import type { Provider } from "../types";
import { ImageTile } from "./ImageTile";
import { Stars } from "./Stars";
import { money } from "../lib/format";
import { useStore } from "../lib/store";

export function ProviderCard({ provider }: { provider: Provider }) {
  const { favourites, toggleFavourite } = useStore();
  const fav = favourites.includes(provider.id);

  return (
    <Link
      to={`/p/${provider.slug}`}
      className="card focusable block animate-fade-up overflow-hidden"
    >
      <div className="relative">
        <ImageTile seed={provider.seed} className="h-40 w-full" rounded="rounded-none" label={provider.name} />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink/70 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div className="text-white">
            <p className="t-caption opacity-90">{provider.nextSlot}</p>
            <p className="font-display text-[17px] font-semibold leading-tight">{provider.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleFavourite(provider.id);
          }}
          aria-pressed={fav}
          aria-label={fav ? "Remove from saved" : "Save provider"}
          className="focusable absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur"
        >
          <Heart size={18} className={fav ? "fill-error text-error" : "text-grey-500"} />
        </button>
        {provider.verified && (
          <span className="badge absolute left-3 top-3 bg-white/90 text-teal-800 backdrop-blur">
            <BadgeCheck size={13} /> Verified
          </span>
        )}
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <Stars rating={provider.rating} count={provider.reviewCount} />
          <span className="t-caption text-grey-500">
            from <span className="nums text-ink">{money(provider.priceFrom)}</span>
          </span>
        </div>
        <p className="t-body text-grey-700">{provider.tagline}</p>
        <p className="t-caption flex items-center gap-1 text-grey-500">
          <MapPin size={13} /> {provider.area} · {provider.distanceKm} km
        </p>
      </div>
    </Link>
  );
}
