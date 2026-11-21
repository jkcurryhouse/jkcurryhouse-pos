"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wifi, WifiOff, LogOut, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useConnectivity } from "@/lib/connectivity";
import { useStore } from "@/lib/store";
import { BrandMark } from "@/components/BrandMark";

const NAV = [
  { href: "/order", label: "Order" },
  { href: "/kds", label: "Kitchen Display" },
  { href: "/payments", label: "Payments" },
  { href: "/till", label: "Till", managerOnly: true },
  { href: "/reports", label: "Reports", managerOnly: true },
];

export function TopBar() {
  const pathname = usePathname();
  const { currentStaff, logout, switchAccount } = useAuth();
  const { isOnline, toggleSimulatedOffline } = useConnectivity();
  const { orders } = useStore();
  const queuedCount = orders.filter((o) => o.syncStatus === "queued").length;

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-gold/25 bg-onyx text-ivory shrink-0">
      <div className="flex items-center gap-4">
        <Link href="/" aria-label="JK Curryhouse POS home">
          <BrandMark tone="dark" />
        </Link>
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.filter((n) => !n.managerOnly || currentStaff?.role === "manager").map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`text-sm px-3 py-1.5 rounded-full font-medium transition-colors ${
                pathname === n.href
                  ? "bg-gold text-onyx"
                  : "text-white/60 hover:bg-white/5 hover:text-ivory"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-xs text-white/60">
        <button
          onClick={toggleSimulatedOffline}
          title="(demo) toggle connectivity"
          className={`hidden md:flex items-center gap-1.5 font-medium px-2 py-1 rounded-full ${
            isOnline ? "text-jade-light hover:bg-jade/20" : "text-chili-light hover:bg-chili/20"
          }`}
        >
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          {isOnline ? "On-site network" : "Offline"}
          {queuedCount > 0 && (
            <span className="bg-chili text-ivory rounded-full px-1.5 text-[10px] font-semibold">
              {queuedCount} queued
            </span>
          )}
        </button>
        {currentStaff && (
          <>
            <span className="hidden sm:inline font-medium">{currentStaff.name}</span>
            <span className="w-7 h-7 rounded-full bg-gold/20 text-gold-light flex items-center justify-center font-semibold text-xs">
              {currentStaff.initials}
            </span>
            <button
              onClick={switchAccount}
              title="Switch account"
              className="p-1.5 rounded-full hover:bg-white/10"
            >
              <Users size={16} />
            </button>
            <button
              onClick={logout}
              title="Log out"
              className="p-1.5 rounded-full hover:bg-white/10"
            >
              <LogOut size={16} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
