"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { useStore } from "./store";
import type { AuditLogEntry, Order } from "./types";

/** Orders + audit entries since `from` (epoch ms), fetched from the database.
 * Falls back to the terminal's locally cached data when the server can't be reached. */
export function useReportData(from: number) {
  const store = useStore();
  const [data, setData] = useState<{ orders: Order[]; auditLog: AuditLogEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const tick = store.lastSyncedAt; // refetch as new data syncs in

  useEffect(() => {
    let cancelled = false;
    setLoading((l) => l && data === null);
    api<{ orders: Order[]; auditLog: AuditLogEntry[] }>(`/api/reports/data?from=${from}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setOffline(false);
      })
      .catch(() => !cancelled && setOffline(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, Math.floor((tick ?? 0) / 30000)]);

  if (offline || !data) {
    return {
      orders: store.orders.filter((o) => o.createdAt >= from),
      auditLog: store.auditLog.filter((a) => a.at >= from),
      loading,
      offline,
    };
  }
  return { ...data, loading: false, offline: false };
}
