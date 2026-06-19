import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import { CATEGORIES, PROVIDERS } from "../data/providers";
import { ProviderCard } from "../components/ProviderCard";
import type { Category } from "../types";

type Sort = "rating" | "price" | "distance";
const SORTS: { id: Sort; label: string }[] = [
  { id: "rating", label: "Top rated" },
  { id: "price", label: "Price: low to high" },
  { id: "distance", label: "Nearest" },
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initialCat = (params.get("cat") as Category) || null;
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | null>(initialCat);
  const [sort, setSort] = useState<Sort>("rating");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const results = useMemo(() => {
    let r = PROVIDERS.filter((p) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.area.toLowerCase().includes(q) ||
        p.categories.some((c) => c.toLowerCase().includes(q)) ||
        p.services.some((s) => s.name.toLowerCase().includes(q));
      const matchesCat = !cat || p.categories.includes(cat);
      const matchesVerified = !verifiedOnly || p.verified;
      return matchesQuery && matchesCat && matchesVerified;
    });
    r = [...r].sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "price") return a.priceFrom - b.priceFrom;
      return a.distanceKm - b.distanceKm;
    });
    return r;
  }, [query, cat, sort, verifiedOnly]);

  function selectCat(c: Category) {
    const next = cat === c ? null : c;
    setCat(next);
    if (next) setParams({ cat: next });
    else setParams({});
  }

  return (
    <div className="animate-fade-up">
      <div className="sticky top-0 z-20 bg-canvas/95 px-5 pb-3 pt-4 backdrop-blur">
        <h1 className="t-h1 mb-3">Search</h1>
        <div className="relative">
          <SearchIcon size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-grey-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search valets, detailers, services…"
            aria-label="Search"
            className="field pl-11 pr-10 rounded-2xl"
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

        {/* filter row */}
        <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setSortOpen((o) => !o)}
              aria-expanded={sortOpen}
              className="chip focusable shrink-0"
            >
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
        <p className="t-caption mb-3 text-grey-500">
          {results.length} {results.length === 1 ? "provider" : "providers"}
          {cat ? ` in ${cat}` : " near you"}
        </p>
        <div className="space-y-4">
          {results.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
          {results.length === 0 && (
            <div className="card mt-6 p-8 text-center">
              <p className="t-h3 mb-1">No matches</p>
              <p className="t-body text-grey-500">
                Try a different search or clear your filters to see everyone near you.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
