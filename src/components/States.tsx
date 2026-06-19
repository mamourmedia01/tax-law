import { WifiOff, AlertCircle } from "lucide-react";
import type { ApiError } from "../lib/api";

export function CardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton h-40 w-full rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-3 w-2/3" />
        <div className="skeleton h-3 w-1/2" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const offline = error.code === "offline";
  return (
    <div className="card mt-6 flex flex-col items-center p-8 text-center">
      <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-error/10 text-error">
        {offline ? <WifiOff size={26} /> : <AlertCircle size={26} />}
      </span>
      <p className="t-h3 mb-1">{offline ? "You're offline" : "Something went wrong"}</p>
      <p className="t-body mb-4 text-grey-500">{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-primary px-6">
          Try again
        </button>
      )}
    </div>
  );
}
