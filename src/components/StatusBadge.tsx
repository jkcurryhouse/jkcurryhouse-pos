import { OrderStatus } from "@/lib/types";

const STYLES: Record<OrderStatus, string> = {
  pending: "bg-chili/15 text-chili-dark border-chili/30",
  preparing: "bg-gold/15 text-gold-dark border-gold/30",
  ready: "bg-jade/15 text-jade-dark border-jade/30",
  served: "bg-cardamom/10 text-cardamom/60 border-cardamom/15",
};

const LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
