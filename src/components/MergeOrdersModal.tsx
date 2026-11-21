"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Order } from "@/lib/types";
import { orderGrandTotal } from "@/lib/billing";
import { X, Merge } from "lucide-react";

export function MergeOrdersModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { orders, mergeOrders } = useStore();
  const { currentStaff } = useAuth();

  const candidates = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.id !== order.id &&
          (o.paymentStatus === "unpaid" || o.paymentStatus === "partial")
      ),
    [orders, order.id]
  );

  function handleMerge(targetId: string) {
    mergeOrders(targetId, order.id, currentStaff?.id ?? "unknown");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button className="absolute inset-0 bg-cardamom/50" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl bg-ivory shadow-ticket p-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-xl">Merge order #{order.orderNumber}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-cardamom/5">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-cardamom/50 mb-4">
          Choose another open ticket to combine this one into. Items and any payments already
          taken move across; order #{order.orderNumber} is closed out.
        </p>

        <div className="overflow-y-auto space-y-2 flex-1">
          {candidates.length === 0 ? (
            <p className="text-sm text-cardamom/35 text-center py-8">
              No other open tickets to merge with right now.
            </p>
          ) : (
            candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => handleMerge(c.id)}
                className="w-full flex items-center justify-between rounded-xl border border-cardamom/10 bg-white px-4 py-3 text-left hover:border-gold/50"
              >
                <div>
                  <p className="font-medium text-sm">
                    Order #{c.orderNumber}
                    <span className="text-cardamom/40 font-normal capitalize">
                      {" · "}
                      {c.orderType.replace("-", " ")}
                      {c.tableNumbers && c.tableNumbers.length > 0
                        ? ` · Table${c.tableNumbers.length > 1 ? "s" : ""} ${c.tableNumbers.join(", ")}`
                        : ""}
                    </span>
                  </p>
                  <p className="text-xs text-cardamom/45 mt-0.5">
                    {c.items.length} item{c.items.length === 1 ? "" : "s"} · £
                    {orderGrandTotal(c).toFixed(2)}
                  </p>
                </div>
                <Merge size={16} className="text-onyx shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
