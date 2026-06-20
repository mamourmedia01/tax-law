import { Bell } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ListSkeleton, ErrorState } from "../components/States";
import { useStore } from "../lib/store";

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Notifications() {
  const { user } = useStore();
  const { data, loading, error, reload } = useAsync(() => (user ? api.notifications() : Promise.resolve([])), [user?.id]);
  const items = data ?? [];

  return (
    <div className="min-h-screen pb-12">
      <TopBar title="Notifications" />
      <div className="px-5 pt-3">
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {!loading && items.length === 0 && (
          <div className="card mt-6 flex flex-col items-center p-8 text-center">
            <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-teal-100 text-teal-700">
              <Bell size={26} />
            </span>
            <p className="t-h3 mb-1">No notifications yet</p>
            <p className="t-body text-grey-500">Booking updates and reminders will show here.</p>
          </div>
        )}
        <div className="space-y-3">
          {items.map((n) => (
            <div key={n.id} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="t-label">{n.title}</p>
                <span className={`badge ${n.bucket === "marketing" ? "bg-grey-100 text-grey-500" : "bg-teal-100 text-teal-800"}`}>
                  {n.bucket}
                </span>
              </div>
              <p className="t-body mt-1 text-grey-700">{n.body}</p>
              <p className="t-caption mt-1.5 text-grey-400">
                {ago(n.created_at)}
                {n.delivered_via ? ` · via ${n.delivered_via}` : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
