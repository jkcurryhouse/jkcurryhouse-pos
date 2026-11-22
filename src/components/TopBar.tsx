"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wifi, WifiOff, LogOut, Users, AlertTriangle, X, RefreshCw, KeyRound } from "lucide-react";
import { useState } from "react";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { useAuth } from "@/lib/auth";
import { useConnectivity } from "@/lib/connectivity";
import { useStore } from "@/lib/store";
import { BrandMark } from "@/components/BrandMark";
import { isManagerRole } from "@/lib/types";

const NAV = [
  { href: "/order", label: "Order" },
  { href: "/kds", label: "Kitchen Display" },
  { href: "/payments", label: "Payments" },
  { href: "/till", label: "Till", managerOnly: true },
  { href: "/reports", label: "Reports", managerOnly: true },
  { href: "/admin", label: "Admin", managerOnly: true },
];

export function TopBar() {
  const pathname = usePathname();
  const { currentStaff, logout, switchAccount } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const { isOnline, toggleSimulatedOffline } = useConnectivity();
  const { outboxCount: queuedCount, syncErrors, dismissSyncError, refreshNow } = useStore();

  return (
    <>
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-gold/25 bg-onyx text-ivory shrink-0">
      <div className="flex items-center gap-4">
        <Link href="/" aria-label="JK Curryhouse POS home">
          <BrandMark tone="dark" />
        </Link>
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.filter((n) => !n.managerOnly || isManagerRole(currentStaff?.role)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`text-sm px-3 py-1.5 rounded-full font-medium transition-colors ${
                (pathname === n.href || (n.href === "/admin" && pathname.startsWith("/admin")))
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
              {queuedCount} to sync
            </span>
          )}
        </button>
        <button onClick={refreshNow} title="Refresh from server" className="p-1.5 rounded-full hover:bg-white/10">
          <RefreshCw size={14} />
        </button>
        {currentStaff && (
          <>
            <span className="hidden sm:inline font-medium">{currentStaff.name}</span>
            <span className="w-7 h-7 rounded-full bg-gold/20 text-gold-light flex items-center justify-center font-semibold text-xs">
              {currentStaff.initials}
            </span>
            <button
              onClick={() => setChangingPassword(true)}
              title="Change my password"
              className="p-1.5 rounded-full hover:bg-white/10"
            >
              <KeyRound size={16} />
            </button>
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
    {changingPassword && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
        <button className="absolute inset-0 bg-cardamom/50" onClick={() => setChangingPassword(false)} aria-label="Close" />
        <div className="relative bg-ivory rounded-2xl shadow-ticket w-full max-w-sm p-5 text-cardamom">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl">Change my password</h2>
            <button onClick={() => setChangingPassword(false)} className="p-1 rounded-full hover:bg-cardamom/5" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <ChangePasswordForm onDone={() => setChangingPassword(false)} />
        </div>
      </div>
    )}
    {syncErrors.length > 0 && (
      <div className="fixed bottom-4 right-4 z-[60] space-y-2 max-w-sm">
        {syncErrors.slice(-3).map((e) => (
          <div
            key={e.opId}
            className="flex items-start gap-2 rounded-xl bg-chili text-ivory px-3 py-2.5 shadow-ticket text-sm"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">A change wasn&apos;t saved</p>
              <p className="text-ivory/85 text-xs">{e.message}</p>
            </div>
            <button onClick={() => dismissSyncError(e.opId)} className="p-0.5 rounded hover:bg-white/10">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    )}
    </>
  );
}
