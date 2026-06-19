import { Star } from "lucide-react";

export function Stars({ rating, count, className = "" }: { rating: number; count?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Star size={15} className="fill-warning text-warning" aria-hidden />
      <span className="nums text-ink">{rating.toFixed(1)}</span>
      {count !== undefined && <span className="t-caption text-grey-500">({count})</span>}
    </span>
  );
}
