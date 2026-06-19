import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { BookingStatus } from "../types";

const MAP: Record<BookingStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  confirmed: { label: "Confirmed", cls: "bg-teal-100 text-teal-800", Icon: Clock },
  completed: { label: "Completed", cls: "bg-success/15 text-success", Icon: CheckCircle2 },
  cancelled: { label: "Cancelled", cls: "bg-grey-100 text-grey-500", Icon: XCircle },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, cls, Icon } = MAP[status];
  return (
    <span className={`badge ${cls}`}>
      <Icon size={13} aria-hidden />
      {label}
    </span>
  );
}
