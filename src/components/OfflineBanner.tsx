"use client";

import { useConnectivity } from "@/lib/connectivity";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const { isOnline } = useConnectivity();
  if (isOnline) return null;
  return (
    <div className="bg-chili text-ivory text-xs sm:text-sm font-medium flex items-center justify-center gap-2 py-1.5 px-4 shrink-0">
      <WifiOff size={14} />
      You&apos;re offline — orders are being taken and queued locally, and will sync
      automatically once the connection is back.
    </div>
  );
}
