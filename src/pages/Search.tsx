import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { ChevronDown, List, Map as MapIcon, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import { CATEGORIES } from "../lib/constants";
import { api, type Provider } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ProviderCard } from "../components/ProviderCard";
import { ListSkeleton, ErrorState } from "../components/States";

type Sort = "rating" | "price" | "distance";
const SORTS: { id: Sort; label: string }[] = [
  { id: "rating", label: "Top rated" },
  { id: "price", label: "Price: low to high" },
  { id: "distance", label: "Nearest" },
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(params.get("cat"));
  const [sort, setSort] = useState<Sort>("rating");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");

  const { data, loading, error, reload } = useAsync(
    () => api.providers({ q: query || undefined, category: cat ?? undefined, verifiedOnly, sort }),
    [query, cat, sort, verifiedOnly],
  );
  const results = data ?? [];

  function selectCat(c: string) {
    const next = cat === c ? null : c;
    setCat(next);
    setParams(next ? { cat: next } : {});
  }

  return (
    <div className="animate-fade-up">
      <div className="sticky top-0 z-20 bg-canvas/95 px-5 pb-3 pt-4 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="t-h1">Search</h1>
          <button
            type="button"
            onClick={() => setView((v) => (v === "list" ? "map" : "list"))}
            className="chip focusable"
          >
            {view === "list" ? <MapIcon size={15} /> : <List size={15} />}
            {view === "list" ? "Map" : "List"}
          </button>
        </div>
        <div className="relative">
          <SearchIcon size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-grey-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search valets, detailers, services…"
            aria-label="Search"
            className="field rounded-2xl pl-11 pr-10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="focusable absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-grey-400 hover:bg-grey-100"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <div className="relative shrink-0">
            <button type="button" onClick={() => setSortOpen((o) => !o)} aria-expanded={sortOpen} className="chip focusable shrink-0">
              <SlidersHorizontal size={15} />
              {SORTS.find((s) => s.id === sort)!.label}
              <ChevronDown size={15} />
            </button>
            {sortOpen && (
              <div className="absolute left-0 top-11 z-30 w-52 overflow-hidden rounded-input bg-white shadow-float">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSort(s.id);
                      setSortOpen(false);
                    }}
                    className={`focusable block w-full px-4 py-3 text-left t-body hover:bg-teal-50 ${
                      sort === s.id ? "font-semibold text-teal-800" : "text-ink"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setVerifiedOnly((v) => !v)}
            aria-pressed={verifiedOnly}
            className={`chip focusable shrink-0 ${verifiedOnly ? "chip-selected" : ""}`}
          >
            Verified only
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => selectCat(c.label)}
              aria-pressed={cat === c.label}
              className={`chip focusable shrink-0 ${cat === c.label ? "chip-selected" : ""}`}
            >
              <span aria-hidden>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-2">
        {!loading && !error && (
          <p className="t-caption mb-3 text-grey-500">
            {results.length} {results.length === 1 ? "provider" : "providers"}
            {cat ? ` in ${cat}` : " near you"}
          </p>
        )}
        {loading && <ListSkeleton />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {!loading && !error && view === "map" && results.length > 0 && <MapView providers={results} />}
        <div className="space-y-4">
          {view === "list" &&
            results.map((p) => <ProviderCard key={p.id} provider={p} />)}
          {!loading && !error && results.length === 0 && (
            <div className="card mt-6 p-8 text-center">
              <p className="t-h3 mb-1">No matches</p>
              <p className="t-body text-grey-500">Try a different search or clear your filters to see everyone near you.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A lightweight schematic map: plots providers by relative lat/lng on a brand canvas.
// (Real tiles would use Leaflet+OSM or Mapbox; this keeps the build offline.)
function MapView({ providers }: { providers: Provider[] }) {
  const navigate = useNavigate();
  const lats = providers.map((p) => p.lat);
  const lngs = providers.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pos = (p: Provider) => ({
    left: `${6 + ((p.lng - minLng) / (maxLng - minLng || 1)) * 88}%`,
    top: `${88 - ((p.lat - minLat) / (maxLat - minLat || 1)) * 80}%`,
  });

  return (
    <div className="mb-4">
      <div
        className="relative h-80 w-full overflow-hidden rounded-card"
        style={{ backgroundImage: "linear-gradient(135deg, #d8e5e8, #93b5bd)" }}
      >
        {/* faint grid */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff55 1px, transparent 1px), linear-gradient(90deg, #ffffff55 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => navigate(`/p/${p.slug}`)}
            className="focusable absolute -translate-x-1/2 -translate-y-full"
            style={pos(p)}
            aria-label={p.name}
          >
            <span className="flex flex-col items-center">
              <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-800 shadow-card">
                £{p.priceFrom}
              </span>
              <span className="mt-0.5 h-3 w-3 rotate-45 rounded-[2px] bg-teal-700 shadow" />
            </span>
          </button>
        ))}
      </div>
      <p className="t-caption mt-2 text-center text-grey-500">Tap a pin to view the provider · schematic map</p>
    </div>
  );
}
