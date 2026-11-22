"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  UtensilsCrossed,
  Users,
  Tag,
  Contact,
  BarChart3,
  Landmark,
  ScrollText,
  Settings,
  Lock,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { RequireAuth } from "@/components/RequireAuth";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useAuth } from "@/lib/auth";
import { isManagerRole } from "@/lib/types";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: Receipt },
  { href: "/admin/reports", label: "Sales reports", icon: BarChart3 },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/admin/promos", label: "Promotions", icon: Tag },
  { href: "/admin/customers", label: "Customers", icon: Contact },
  { href: "/admin/till", label: "Till history", icon: Landmark },
  { href: "/admin/staff", label: "Staff", icon: Users },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentStaff } = useAuth();

  if (!isManagerRole(currentStaff?.role)) {
    return (
      <div className="h-screen flex flex-col">
        <TopBar />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <Lock size={28} className="text-cardamom/30 mb-3" />
          <p className="font-display text-xl mb-1">Manager access only</p>
          <p className="text-sm text-cardamom/50 max-w-xs">
            Sign in as a manager or admin to use the admin panel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <OfflineBanner />
      <div className="flex-1 flex min-h-0">
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-cardamom/10 bg-white/60 py-4 px-3 gap-0.5 overflow-y-auto">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-cardamom/40">Admin</p>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-onyx text-ivory" : "text-cardamom/70 hover:bg-cardamom/5"
                }`}
              >
                <Icon size={16} className={active ? "text-gold-light" : ""} />
                {label}
              </Link>
            );
          })}
          <p className="mt-auto px-3 pt-4 text-[11px] text-cardamom/40 leading-relaxed">
            Signed in as {currentStaff?.name} ({currentStaff?.role}). Every change here is recorded in the audit log.
          </p>
        </aside>
        <div className="flex-1 min-w-0 overflow-y-auto">
          <nav className="md:hidden flex gap-1.5 overflow-x-auto px-4 pt-3 pb-1">
            {NAV.map(({ href, label }) => {
              const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${active ? "bg-onyx text-ivory border-onyx" : "bg-white border-cardamom/15"}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
          <main className="px-4 sm:px-8 py-6 max-w-6xl">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
