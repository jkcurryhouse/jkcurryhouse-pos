"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { useEffect, useState } from "react";
import { KdsTicket } from "@/components/KdsTicket";
import { RequireAuth } from "@/components/RequireAuth";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useConnectivity } from "@/lib/connectivity";
import { Order, OrderStatus } from "@/lib/types";
import { Globe, Wifi, WifiOff, LogOut, Users, Clock, Play } from "lucide-react";
import { isManagerRole } from "@/lib/types";

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
];

function WaitingTicket({ order, now }: { order: Order; now: number }) {
  const { fireWaitingOrder } = useStore();
  const dueIn = Math.max(0, Math.round(((order.scheduledFor ?? now) - now) / 60000));

  return (
    <div className="rounded-xl border border-gold-light/30 bg-charcoal-light text-ivory p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold">#{order.orderNumber}</span>
            {order.channel === "online" && (
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gold-light">
                <Globe size={11} /> Online
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-0.5 capitalize">
            {order.orderType.replace("-", " ")}
            {order.tableNumbers && order.tableNumbers.length > 0
              ? ` · Table${order.tableNumbers.length > 1 ? "s" : ""} ${order.tableNumbers.join(", ")}`
              : ""}
          </p>
          {order.deliveryDetails && (
            <p className="text-xs text-white/50 mt-0.5">
              {order.deliveryDetails.name} · {order.deliveryDetails.phone}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="flex items-center gap-1 text-xs font-semibold text-gold-light">
            <Clock size={12} />
            {order.scheduledFor ? new Date(order.scheduledFor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
          </p>
          <p className="text-[11px] text-white/40 mt-0.5">in {dueIn}m</p>
        </div>
      </div>
      <p className="text-xs text-white/40">{order.items.length} item{order.items.length === 1 ? "" : "s"}</p>
      <button
        onClick={() => fireWaitingOrder(order.id)}
        className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gold-light border border-gold-light/30 rounded-lg py-2 hover:bg-gold-light/10"
      >
        <Play size={12} /> Start now
      </button>
    </div>
  );
}

function KdsScreen() {
  const { orders, simulateOnlineOrder } = useStore();
  const { currentStaff, logout, switchAccount } = useAuth();
  const { isOnline, toggleSimulatedOffline } = useConnectivity();

  // Ticks every 15s so a scheduled order automatically drops out of the
  // Waiting column and into Pending once its ready-for time arrives —
  // without staff needing to touch anything.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const isWaiting = (o: Order) =>
    !!o.scheduledFor && o.scheduledFor > now && o.status === "pending" && !o.scheduleReleased;

  const active = orders.filter((o) => o.sentToKitchen && o.status !== "served");
  const servedToday = orders.filter((o) => o.sentToKitchen && o.status === "served");
  const waitingOrders = active.filter(isWaiting);

  return (
    <div className="h-screen flex flex-col bg-charcoal">
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="JK Curryhouse POS home">
            <BrandMark tone="dark" />
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <Link
              href="/order"
              className="text-sm px-3 py-1.5 rounded-full font-medium text-white/50 hover:bg-white/5"
            >
              Order
            </Link>
            <span className="text-sm px-3 py-1.5 rounded-full font-medium bg-gold text-onyx">
              Kitchen Display
            </span>
            <Link
              href="/payments"
              className="text-sm px-3 py-1.5 rounded-full font-medium text-white/50 hover:bg-white/5"
            >
              Payments
            </Link>
            {isManagerRole(currentStaff?.role) && (
              <>
                <Link
                  href="/till"
                  className="text-sm px-3 py-1.5 rounded-full font-medium text-white/50 hover:bg-white/5"
                >
                  Till
                </Link>
                <Link
                  href="/reports"
                  className="text-sm px-3 py-1.5 rounded-full font-medium text-white/50 hover:bg-white/5"
                >
                  Reports
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/50">
          <button
            onClick={toggleSimulatedOffline}
            title="(demo) toggle connectivity"
            className={`hidden md:flex items-center gap-1.5 font-medium ${
              isOnline ? "text-jade-light" : "text-chili-light"
            }`}
          >
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? "On-site network" : "Offline"}
          </button>
          {currentStaff && (
            <>
              <span className="hidden sm:inline font-medium text-white/70">{currentStaff.name}</span>
              <span className="w-7 h-7 rounded-full bg-gold/20 text-gold-light flex items-center justify-center font-semibold text-xs">
                {currentStaff.initials}
              </span>
              <button onClick={switchAccount} title="Switch account" className="p-1.5 rounded-full hover:bg-white/5">
                <Users size={16} />
              </button>
              <button onClick={logout} title="Log out" className="p-1.5 rounded-full hover:bg-white/5">
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </header>
      <OfflineBanner />
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10">
        <p className="text-sm text-white/50">
          {active.length} active order{active.length === 1 ? "" : "s"}
          {waitingOrders.length > 0 ? ` · ${waitingOrders.length} waiting` : ""} · {servedToday.length} served today
        </p>
        <button
          onClick={simulateOnlineOrder}
          className="flex items-center gap-1.5 text-xs font-semibold text-gold-light border border-gold-light/30 rounded-full px-3 py-1.5 hover:bg-gold-light/10"
        >
          <Globe size={13} /> Simulate incoming website order
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 sm:px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full min-w-[1180px] md:min-w-0">
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-white/70 font-semibold text-sm uppercase tracking-wide flex items-center gap-1.5">
                <Clock size={13} /> Waiting
              </h2>
              <span className="text-white/40 text-xs font-mono">{waitingOrders.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {waitingOrders.length === 0 ? (
                <div className="text-white/25 text-sm text-center py-10 border border-dashed border-white/10 rounded-xl">
                  No scheduled orders
                </div>
              ) : (
                waitingOrders
                  .sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))
                  .map((order) => <WaitingTicket key={order.id} order={order} now={now} />)
              )}
            </div>
          </div>
          {COLUMNS.map((col) => {
            const columnOrders = active.filter((o) => o.status === col.status && !isWaiting(o));
            return (
              <div key={col.status} className="flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-white/70 font-semibold text-sm uppercase tracking-wide">
                    {col.label}
                  </h2>
                  <span className="text-white/40 text-xs font-mono">{columnOrders.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {columnOrders.length === 0 ? (
                    <div className="text-white/25 text-sm text-center py-10 border border-dashed border-white/10 rounded-xl">
                      No orders
                    </div>
                  ) : (
                    columnOrders
                      .sort((a, b) => a.createdAt - b.createdAt)
                      .map((order) => <KdsTicket key={order.id} order={order} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function KdsPage() {
  return (
    <RequireAuth>
      <KdsScreen />
    </RequireAuth>
  );
}
