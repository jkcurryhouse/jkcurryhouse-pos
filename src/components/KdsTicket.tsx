"use client";

import { Order } from "@/lib/types";
import { useStore } from "@/lib/store";
import { StatusBadge } from "./StatusBadge";
import { AlertTriangle, Ban, Globe, UtensilsCrossed, CloudOff } from "lucide-react";
import { useEffect, useState } from "react";

function useElapsedMinutes(createdAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  return Math.floor((now - createdAt) / 60000);
}

export function KdsTicket({ order }: { order: Order }) {
  const { advanceLineStatus, flagLine } = useStore();
  const minutes = useElapsedMinutes(order.createdAt);
  const overThreshold = minutes >= 12 && order.status !== "served";

  return (
    <div
      className={`rounded-xl border bg-charcoal-light text-ivory p-4 flex flex-col gap-3 ${
        overThreshold ? "border-chili shadow-[0_0_0_1px_rgba(174,52,40,0.5)]" : "border-white/10"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold">#{order.orderNumber}</span>
            {order.channel === "online" ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gold-light">
                <Globe size={11} /> Online
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                <UtensilsCrossed size={11} /> POS
              </span>
            )}
            {order.syncStatus === "queued" && (
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-chili-light">
                <CloudOff size={11} /> Queued
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-0.5 capitalize">
            {order.orderType.replace("-", " ")}
            {order.tableNumbers && order.tableNumbers.length > 0
              ? ` · Table${order.tableNumbers.length > 1 ? "s" : ""} ${order.tableNumbers.join(", ")}`
              : ""}
            {order.guestCount ? ` · ${order.guestCount} guest${order.guestCount === 1 ? "" : "s"}` : ""}
            {order.scheduledFor
              ? ` · ready ${new Date(order.scheduledFor).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
          </p>
          {order.deliveryDetails && (
            <p className="text-xs text-gold-light/90 mt-0.5">
              {order.deliveryDetails.name} · {order.deliveryDetails.phone}
              {order.orderType === "delivery" && (
                <>
                  <br />
                  {order.deliveryDetails.addressLine1}, {order.deliveryDetails.postcode}
                </>
              )}
            </p>
          )}
        </div>
        <div className="text-right">
          <StatusBadge status={order.status} />
          <p
            className={`text-xs mt-1 font-mono tabular-nums ${
              overThreshold ? "text-chili-light font-bold" : "text-white/40"
            }`}
          >
            {minutes}m
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {order.items.map((item) => (
          <button
            key={item.lineId}
            onClick={() => advanceLineStatus(order.id, item.lineId)}
            disabled={item.status === "served"}
            className={`text-left rounded-lg px-3 py-2 border transition-colors ${
              item.status === "served"
                ? "border-white/5 bg-white/[0.02] opacity-40"
                : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-semibold text-sm">
                  {item.quantity}× {item.name}
                </span>
                {item.spiceLevel && (
                  <span className="text-xs text-white/45 ml-1.5 capitalize">
                    {item.spiceLevel.replace("-", " ")}
                  </span>
                )}
                {item.modifiers.length > 0 && (
                  <p className="text-xs text-white/45">
                    {item.modifiers.map((m) => m.optionLabel).join(", ")}
                  </p>
                )}
                {item.notes && (
                  <p className="text-xs text-gold-light italic mt-0.5">“{item.notes}”</p>
                )}
                {item.allergens.length > 0 && (
                  <p className="text-[10px] text-chili-light uppercase tracking-wide mt-0.5">
                    Allergens: {item.allergens.join(", ")}
                  </p>
                )}
              </div>
              <StatusBadge status={item.status} />
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-white/10">
        <button
          onClick={() => {
            const firstActive = order.items.find((i) => i.status !== "served");
            if (firstActive) flagLine(order.id, firstActive.lineId, "delayed");
          }}
          className="flex items-center gap-1 text-[11px] font-medium text-gold-light/80 hover:text-gold-light px-2 py-1 rounded-md hover:bg-white/5"
        >
          <AlertTriangle size={12} /> Flag delayed
        </button>
        <button
          onClick={() => {
            const firstActive = order.items.find((i) => i.status !== "served");
            if (firstActive) flagLine(order.id, firstActive.lineId, "unavailable");
          }}
          className="flex items-center gap-1 text-[11px] font-medium text-chili-light/80 hover:text-chili-light px-2 py-1 rounded-md hover:bg-white/5"
        >
          <Ban size={12} /> Flag unavailable
        </button>
      </div>
    </div>
  );
}
