"use client";

/**
 * POS client store.
 *
 * Every change is applied to local state immediately (so order-taking never waits on the
 * network) and queued as an "op" in a persisted outbox. The outbox is flushed to
 * /api/ops whenever the terminal is online; the server applies each op exactly once
 * (op id = idempotency key) and returns the authoritative record, which replaces the
 * optimistic one. A poll of /api/sync every few seconds pulls in changes made by other
 * terminals, the KDS and the website.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RESTAURANT_ID } from "./mock-data";
import { useConnectivity } from "./connectivity";
import { useAuth, ManagerApproval } from "./auth";
import { api, ApiClientError, newClientId } from "./api";
import { netSubtotal, amountPaidForItems, serviceChargeAmount } from "./billing";
import { normalisePhone } from "./phone";
import {
  AuditLogEntry,
  Customer,
  CustomerContactSnapshot,
  MenuCategory,
  MenuItem,
  Order,
  OrderDiscount,
  OrderLineItem,
  OrderStatus,
  OrderType,
  Payment,
  PaymentMethod,
  PromoCode,
  SelectedModifier,
  SpiceLevel,
  StaffAccount,
  TillSession,
} from "./types";

const CACHE_KEY = "jkpos-cache-v7";
const OUTBOX_KEY = "jkpos-outbox-v1";
const POLL_MS = 3000;

export interface RestaurantSettings {
  restaurantId: string;
  name: string;
  legalName: string;
  tagline: string;
  addressLines: string[];
  phone: string;
  email: string;
  vatNumber: string;
  companyNumber: string;
  receiptFooter: string;
  vatRatePercent: number;
  defaultServiceChargePercent: number;
  serviceChargeMinGuests: number;
  inactivityLogoutMinutes: number;
  autoSendToKitchen: boolean;
  kdsWarnMinutes: number;
  tipPresets: number[];
  timezone: string;
  updatedAt: number;
}

interface DraftLine {
  lineId: string;
  menuItem: MenuItem;
  quantity: number;
  spiceLevel?: SpiceLevel;
  modifiers: SelectedModifier[];
  notes?: string;
}

type DraftDiscountInput =
  | { kind: "promo"; code: string; label: string; percentOff: number; isPercent: boolean; staffId: string; at: number }
  | {
      kind: "staff";
      percentOff: number;
      reason: string;
      staffId: string;
      approval: ManagerApproval | null;
      at: number;
    };

// ---- outbox op shapes (mirror src/server/ops.ts) -------------------------
type Op =
  | { type: "order.create"; order: Record<string, unknown> }
  | { type: "order.line.advance"; orderId: string; lineId: string }
  | { type: "order.line.flag"; orderId: string; lineId: string; flag: "delayed" | "unavailable" }
  | { type: "order.sendToKitchen"; orderId: string }
  | { type: "order.fireWaiting"; orderId: string }
  | {
      type: "order.pay";
      orderId: string;
      payments: Array<{ id: string; method: PaymentMethod; amount: number; cashTendered?: number; changeGiven?: number }>;
      tip: number;
      serviceChargePercent?: number;
    }
  | { type: "order.refund"; orderId: string; approval?: { managerId: string; token: string } }
  | { type: "order.void"; orderId: string; reason: string; approval?: { managerId: string; token: string } }
  | { type: "order.merge"; primaryOrderId: string; secondaryOrderId: string }
  | { type: "menu.toggleStock"; itemId: string }
  | { type: "till.open"; tillId: string; openingFloat: number }
  | { type: "till.cash"; movementId: string; movementType: "in" | "out"; amount: number; reason: string }
  | { type: "till.close"; countedCash: number };

export interface OutboxEntry {
  id: string;
  staffId: string;
  at: number;
  op: Op;
  attempts: number;
}

export interface SyncError {
  opId: string;
  type: string;
  message: string;
  at: number;
}

function opOrderIds(op: Op): string[] {
  switch (op.type) {
    case "order.create":
      return [op.order.id as string];
    case "order.merge":
      return [op.primaryOrderId, op.secondaryOrderId];
    case "menu.toggleStock":
    case "till.open":
    case "till.cash":
    case "till.close":
      return [];
    default:
      return [op.orderId];
  }
}

interface CacheShape {
  orders: Order[];
  menuItems: MenuItem[];
  categories: MenuCategory[];
  promoCodes: (PromoCode & { active?: boolean })[];
  settings: RestaurantSettings | null;
  staffDirectory: StaffAccount[];
  tillSessions: TillSession[];
  auditLog: AuditLogEntry[];
  customers: Customer[];
  serverTime: number | null;
}

interface SyncResponse {
  mode: "full" | "delta";
  serverTime: number;
  settings: RestaurantSettings | null;
  staffDirectory: (StaffAccount & { active: boolean })[];
  categories: MenuCategory[];
  menuItems: MenuItem[];
  promoCodes: (PromoCode & { active?: boolean })[];
  orders: Order[];
  tillSessions: TillSession[];
  auditLog: AuditLogEntry[];
  customers: Customer[];
}

interface OpsResponse {
  results: Array<{ opId: string; ok: boolean; error?: string; retry?: boolean; orders?: Order[]; tillChanged?: boolean }>;
  menuItems: MenuItem[];
  serverTime: number;
}

interface StoreShape {
  orders: Order[];
  menuItems: MenuItem[];
  categories: MenuCategory[];
  promoCodes: PromoCode[];
  settings: RestaurantSettings | null;
  staffDirectory: StaffAccount[];
  staffNameById: (id?: string) => string;
  nextOrderNumber: number;
  tillSessions: TillSession[];
  auditLog: AuditLogEntry[];
  customers: Customer[];
  // sync status
  outboxCount: number;
  syncErrors: SyncError[];
  dismissSyncError: (opId: string) => void;
  lastSyncedAt: number | null;
  bootstrapped: boolean;
  refreshNow: () => void;
  // draft order
  draftLines: DraftLine[];
  orderType: OrderType;
  tableNumbers: string[];
  addTableNumber: (t: string) => void;
  removeTableNumber: (t: string) => void;
  guestCount: number;
  setGuestCount: (n: number) => void;
  draftScheduledFor: number | null;
  setDraftScheduledFor: (t: number | null) => void;
  draftDiscount: OrderDiscount | null;
  draftCustomer: CustomerContactSnapshot | null;
  setDraftCustomer: (details: CustomerContactSnapshot | null) => void;
  findCustomerByPhone: (phone: string) => Customer | undefined;
  addDraftLine: (line: Omit<DraftLine, "lineId">) => void;
  removeDraftLine: (lineId: string) => void;
  updateDraftQuantity: (lineId: string, quantity: number) => void;
  setOrderType: (t: OrderType) => void;
  clearDraft: () => void;
  submitOrder: (staffName: string, staffId: string) => void;
  // order actions
  toggleOutOfStock: (itemId: string) => void;
  advanceLineStatus: (orderId: string, lineId: string) => void;
  flagLine: (orderId: string, lineId: string, flag: "delayed" | "unavailable") => void;
  fireWaitingOrder: (orderId: string) => void;
  sendToKitchen: (orderId: string) => void;
  simulateOnlineOrder: () => void;
  recordPayment: (
    orderId: string,
    payments: Array<{ method: PaymentMethod; amount: number; cashTendered?: number; changeGiven?: number }>,
    tip: number,
    staffId: string,
    serviceChargePercent?: number
  ) => void;
  refundOrder: (orderId: string, staffId: string, approval?: ManagerApproval | null) => void;
  voidOrder: (orderId: string, staffId: string, reason: string, approval?: ManagerApproval | null) => void;
  mergeOrders: (primaryOrderId: string, secondaryOrderId: string, staffId: string) => void;
  applyPromoCode: (code: string, subtotal: number, staffId: string) => boolean | string;
  applyStaffDiscount: (
    percentOff: number,
    subtotal: number,
    reason: string,
    staffId: string,
    approval: ManagerApproval | null
  ) => void;
  clearDraftDiscount: () => void;
  // till
  currentTill: TillSession | null;
  openTill: (openingFloat: number, staffId: string) => void;
  addCashMovement: (type: "in" | "out", amount: number, reason: string, staffId: string) => void;
  closeTill: (countedCash: number, staffId: string) => void;
}

const StoreContext = createContext<StoreShape | null>(null);

function computeOrderStatus(items: OrderLineItem[]): OrderStatus {
  if (items.every((i) => i.status === "served")) return "served";
  if (items.every((i) => i.status === "ready" || i.status === "served")) return "ready";
  if (items.some((i) => i.status !== "pending")) return "preparing";
  return "pending";
}

const nextStatus: Record<OrderStatus, OrderStatus> = {
  pending: "preparing",
  preparing: "ready",
  ready: "served",
  served: "served",
};

function upsertById<T extends { id: string }>(list: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return list;
  const map = new Map(list.map((x) => [x.id, x]));
  for (const x of incoming) map.set(x.id, x);
  return Array.from(map.values());
}

function loadCache(): Partial<CacheShape> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadOutbox(): OutboxEntry[] {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { isOnline } = useConnectivity();
  const { currentStaff, setInactivityLimitMinutes } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  // server-backed state (cached locally for offline start-up)
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [promoCodes, setPromoCodes] = useState<(PromoCode & { active?: boolean })[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [staffDirectory, setStaffDirectory] = useState<StaffAccount[]>([]);
  const [tillSessions, setTillSessions] = useState<TillSession[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [serverTime, setServerTime] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const outboxRef = useRef<OutboxEntry[]>([]);
  const [syncErrors, setSyncErrors] = useState<SyncError[]>([]);

  // draft order
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("dine-in");
  const [tableNumbers, setTableNumbers] = useState<string[]>([]);
  const [guestCount, setGuestCount] = useState(2);
  const [draftScheduledFor, setDraftScheduledFor] = useState<number | null>(null);
  const [draftDiscountInput, setDraftDiscountInput] = useState<DraftDiscountInput | null>(null);
  const [draftCustomer, setDraftCustomer] = useState<CustomerContactSnapshot | null>(null);

  // ---------------------------------------------------------------- hydrate & persist
  useEffect(() => {
    const c = loadCache();
    setOrders(c.orders ?? []);
    setMenuItems(c.menuItems ?? []);
    setCategories(c.categories ?? []);
    setPromoCodes(c.promoCodes ?? []);
    setSettings(c.settings ?? null);
    setStaffDirectory(c.staffDirectory ?? []);
    setTillSessions(c.tillSessions ?? []);
    setAuditLog(c.auditLog ?? []);
    setCustomers(c.customers ?? []);
    setServerTime(c.serverTime ?? null);
    const ob = loadOutbox();
    outboxRef.current = ob;
    setOutbox(ob);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: CacheShape = {
      orders,
      menuItems,
      categories,
      promoCodes,
      settings,
      staffDirectory,
      tillSessions,
      auditLog: auditLog.slice(-2000),
      customers,
      serverTime,
    };
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // storage full — the server is the source of truth, so this is only a cache
    }
  }, [hydrated, orders, menuItems, categories, promoCodes, settings, staffDirectory, tillSessions, auditLog, customers, serverTime]);

  const writeOutbox = useCallback((next: OutboxEntry[]) => {
    outboxRef.current = next;
    setOutbox(next);
    try {
      window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  useEffect(() => {
    if (settings) setInactivityLimitMinutes(settings.inactivityLogoutMinutes);
  }, [settings, setInactivityLimitMinutes]);

  // ---------------------------------------------------------------- sync engine
  const syncing = useRef(false);
  const forceFull = useRef(false);
  const kick = useRef<() => void>(() => {});

  const pendingOrderIds = useCallback(() => {
    const s = new Set<string>();
    for (const e of outboxRef.current) opOrderIds(e.op).forEach((id) => s.add(id));
    return s;
  }, []);

  const applyServerOrders = useCallback(
    (incoming: Order[], mode: "full" | "delta") => {
      const pending = pendingOrderIds();
      setOrders((prev) => {
        if (mode === "full") {
          const keepLocal = prev.filter((o) => pending.has(o.id));
          const server = incoming.filter((o) => !o.mergedIntoOrderId && !pending.has(o.id));
          return upsertById(server, keepLocal);
        }
        let next = prev;
        const merged = incoming.filter((o) => o.mergedIntoOrderId).map((o) => o.id);
        if (merged.length) next = next.filter((o) => !merged.includes(o.id));
        return upsertById(
          next,
          incoming.filter((o) => !o.mergedIntoOrderId && !pending.has(o.id))
        );
      });
    },
    [pendingOrderIds]
  );

  const applySync = useCallback(
    (r: SyncResponse) => {
      if (!r || !Array.isArray(r.orders) || !Array.isArray(r.menuItems)) return;
      applyServerOrders(r.orders, r.mode);
      if (r.settings) setSettings(r.settings);
      setStaffDirectory(r.staffDirectory.filter((s) => s.active !== false));
      if (r.mode === "full") {
        setCategories(r.categories.filter((c) => c.active !== false));
        setMenuItems(r.menuItems.filter((m) => m.active !== false));
        setPromoCodes(r.promoCodes);
        setTillSessions(r.tillSessions);
        setAuditLog(r.auditLog);
        setCustomers(r.customers.filter((c) => !c.anonymised));
      } else {
        if (r.categories.length)
          setCategories((prev) =>
            upsertById(prev, r.categories)
              .filter((c) => c.active !== false)
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          );
        if (r.menuItems.length)
          setMenuItems((prev) =>
            upsertById(prev, r.menuItems)
              .filter((m) => m.active !== false)
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          );
        if (r.promoCodes.length)
          setPromoCodes((prev) => {
            const map = new Map(prev.map((p) => [p.code, p]));
            r.promoCodes.forEach((p) => map.set(p.code, p));
            return Array.from(map.values());
          });
        if (r.tillSessions.length) setTillSessions((prev) => upsertById(prev, r.tillSessions));
        if (r.auditLog.length) setAuditLog((prev) => upsertById(prev, r.auditLog));
        if (r.customers.length)
          setCustomers((prev) => upsertById(prev, r.customers).filter((c) => !c.anonymised));
      }
      setServerTime(r.serverTime);
      setLastSyncedAt(Date.now());
    },
    [applyServerOrders]
  );

  const flushOutbox = useCallback(async (): Promise<boolean> => {
    while (outboxRef.current.length > 0) {
      const batch = outboxRef.current.slice(0, 25);
      let res: OpsResponse;
      try {
        res = await api<OpsResponse>("/api/ops", {
          body: { ops: batch.map(({ id, staffId, at, op }) => ({ id, staffId, at, op })) },
          timeoutMs: 20000,
        });
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 400) {
          // The batch itself was rejected as malformed — drop it so it can't wedge the queue.
          setSyncErrors((prev) => [
            ...prev,
            ...batch.map((b) => ({ opId: b.id, type: b.op.type, message: e.message, at: Date.now() })),
          ]);
          const ids = new Set(batch.map((b) => b.id));
          writeOutbox(outboxRef.current.filter((x) => !ids.has(x.id)));
          forceFull.current = true;
          continue;
        }
        return false; // offline / server down / 401 — try again later
      }
      const done = new Set<string>();
      const returned: Order[] = [];
      let stop = false;
      for (const r of res.results) {
        if (r.ok) {
          done.add(r.opId);
          if (r.orders) returned.push(...r.orders);
          if (r.tillChanged) forceFull.current = true;
        } else if (r.retry) {
          // Transient server error: retry later, but give up after a few attempts so one
          // poisoned op can't block the queue forever.
          const entry = outboxRef.current.find((x) => x.id === r.opId);
          if (entry && entry.attempts + 1 >= 5) {
            done.add(r.opId);
            setSyncErrors((prev) => [
              ...prev,
              { opId: r.opId, type: entry.op.type, message: `${r.error ?? "Server error"} (gave up after 5 tries)`, at: Date.now() },
            ]);
            forceFull.current = true;
            continue;
          }
          writeOutbox(outboxRef.current.map((x) => (x.id === r.opId ? { ...x, attempts: x.attempts + 1 } : x)));
          stop = true;
          break;
        } else {
          done.add(r.opId);
          const entry = batch.find((b) => b.id === r.opId);
          setSyncErrors((prev) => [
            ...prev,
            { opId: r.opId, type: entry?.op.type ?? "change", message: r.error ?? "Rejected by server", at: Date.now() },
          ]);
          forceFull.current = true; // re-pull to undo the optimistic change
        }
      }
      writeOutbox(outboxRef.current.filter((x) => !done.has(x.id)));
      if (returned.length) {
        // latest version of each order wins
        const latest = new Map<string, Order>();
        returned.forEach((o) => latest.set(o.id, o));
        applyServerOrders(Array.from(latest.values()), "delta");
      }
      if (res.menuItems.length)
        setMenuItems((prev) => upsertById(prev, res.menuItems).filter((m) => m.active !== false));
      if (stop) return false;
    }
    return true;
  }, [applyServerOrders, writeOutbox]);

  const serverTimeRef = useRef<number | null>(null);
  useEffect(() => {
    serverTimeRef.current = serverTime;
  }, [serverTime]);

  const runSync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      await flushOutbox();
      const full = forceFull.current || serverTimeRef.current == null;
      forceFull.current = false;
      const r = await api<SyncResponse>(full ? "/api/sync" : `/api/sync?since=${serverTimeRef.current}`);
      applySync(r);
    } catch {
      // offline or server error — the poll loop retries
    } finally {
      syncing.current = false;
    }
  }, [flushOutbox, applySync]);

  useEffect(() => {
    kick.current = () => {
      void runSync();
    };
  }, [runSync]);

  // Bootstrap with a full sync each time someone signs in, then poll.
  useEffect(() => {
    if (!hydrated || !currentStaff) return;
    forceFull.current = true;
  }, [hydrated, currentStaff]);

  useEffect(() => {
    if (!hydrated || !currentStaff || !isOnline) return;
    void runSync();
    const t = setInterval(() => void runSync(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void runSync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, currentStaff, isOnline, runSync]);

  const enqueue = useCallback(
    (op: Op, staffId?: string) => {
      const entry: OutboxEntry = {
        id: newClientId("op"),
        staffId: staffId ?? currentStaff?.id ?? "unknown",
        at: Date.now(),
        op,
        attempts: 0,
      };
      writeOutbox([...outboxRef.current, entry]);
      // flush promptly rather than waiting for the next poll
      setTimeout(() => kick.current(), 0);
    },
    [currentStaff, writeOutbox]
  );

  const refreshNow = useCallback(() => {
    forceFull.current = true;
    kick.current();
  }, []);

  const dismissSyncError = useCallback((opId: string) => {
    setSyncErrors((prev) => prev.filter((e) => e.opId !== opId));
  }, []);

  // ---------------------------------------------------------------- derived
  const pendingIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of outbox) opOrderIds(e.op).forEach((id) => s.add(id));
    return s;
  }, [outbox]);

  const ordersWithSync = useMemo(
    () =>
      orders
        .filter((o) => !o.mergedIntoOrderId)
        .map((o) => {
          const syncStatus = pendingIds.has(o.id) ? ("queued" as const) : ("synced" as const);
          return o.syncStatus === syncStatus ? o : { ...o, syncStatus };
        }),
    [orders, pendingIds]
  );

  const nextOrderNumber = useMemo(
    () => orders.reduce((m, o) => Math.max(m, o.orderNumber), 100) + 1,
    [orders]
  );

  const staffNameById = useCallback(
    (id?: string) => {
      if (!id) return "Unknown";
      if (id === "online") return "Website";
      return staffDirectory.find((s) => s.id === id)?.name ?? id;
    },
    [staffDirectory]
  );

  // ---------------------------------------------------------------- draft
  const addDraftLine = useCallback((line: Omit<DraftLine, "lineId">) => {
    setDraftLines((prev) => [...prev, { ...line, lineId: newClientId("line") }]);
  }, []);

  const addTableNumber = useCallback((t: string) => {
    const trimmed = t.trim();
    if (!trimmed) return;
    setTableNumbers((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  }, []);

  const removeTableNumber = useCallback((t: string) => {
    setTableNumbers((prev) => prev.filter((n) => n !== t));
  }, []);

  const removeDraftLine = useCallback((lineId: string) => {
    setDraftLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const updateDraftQuantity = useCallback((lineId: string, quantity: number) => {
    setDraftLines((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.max(1, quantity) } : l))
    );
  }, []);

  const clearDraft = useCallback(() => {
    setDraftLines([]);
    setTableNumbers([]);
    setGuestCount(2);
    setDraftScheduledFor(null);
    setDraftDiscountInput(null);
    setDraftCustomer(null);
  }, []);

  const clearDraftDiscount = useCallback(() => setDraftDiscountInput(null), []);

  const draftSubtotal = useMemo(
    () =>
      draftLines.reduce(
        (s, d) => s + (d.menuItem.price + d.modifiers.reduce((m, x) => m + x.priceDelta, 0)) * d.quantity,
        0
      ),
    [draftLines]
  );

  // The discount is a percentage, so its £ amount follows the ticket as items change —
  // the server recalculates it the same way when the order is saved.
  const draftDiscount = useMemo<OrderDiscount | null>(() => {
    if (!draftDiscountInput) return null;
    const amount =
      draftDiscountInput.kind === "promo" && !draftDiscountInput.isPercent
        ? Math.min(draftDiscountInput.percentOff, draftSubtotal) // fixed £ offer
        : +(draftSubtotal * (draftDiscountInput.percentOff / 100)).toFixed(2);
    if (draftDiscountInput.kind === "promo") {
      return {
        id: "draft-discount",
        kind: "promo",
        code: draftDiscountInput.code,
        label: draftDiscountInput.label,
        amount,
        appliedByStaffId: draftDiscountInput.staffId,
        appliedAt: draftDiscountInput.at,
      };
    }
    return {
      id: "draft-discount",
      kind: "staff",
      label: `Staff discount ${draftDiscountInput.percentOff}% — ${draftDiscountInput.reason}`,
      amount,
      appliedByStaffId: draftDiscountInput.staffId,
      approvedByStaffId: draftDiscountInput.approval?.managerId ?? draftDiscountInput.staffId,
      appliedAt: draftDiscountInput.at,
    };
  }, [draftDiscountInput, draftSubtotal]);

  const findCustomerByPhone = useCallback(
    (phone: string) => {
      const normalised = normalisePhone(phone);
      if (!normalised) return undefined;
      return customers.find((c) => normalisePhone(c.phone) === normalised);
    },
    [customers]
  );

  const applyPromoCode = useCallback(
    (code: string, subtotal: number, staffId: string): boolean | string => {
      const match = promoCodes.find((p) => p.code.toUpperCase() === code.trim().toUpperCase());
      if (!match || match.active === false) return false;
      if (match.minSpend && subtotal < match.minSpend)
        return `This code needs a minimum spend of £${match.minSpend.toFixed(2)}`;
      setDraftDiscountInput({
        kind: "promo",
        code: match.code,
        label: match.label,
        percentOff: match.percentOff,
        isPercent: match.isPercent !== false,
        staffId,
        at: Date.now(),
      });
      return true;
    },
    [promoCodes]
  );

  const applyStaffDiscount = useCallback(
    (percentOff: number, _subtotal: number, reason: string, staffId: string, approval: ManagerApproval | null) => {
      setDraftDiscountInput({ kind: "staff", percentOff, reason, staffId, approval, at: Date.now() });
    },
    []
  );

  const submitOrder = useCallback(
    (staffName: string, staffId: string) => {
      if (draftLines.length === 0) return;
      const id = newClientId("order");
      const createdAt = Date.now();
      const items: OrderLineItem[] = draftLines.map((d) => ({
        lineId: d.lineId,
        menuItemId: d.menuItem.id,
        name: d.menuItem.name,
        unitPrice: d.menuItem.price + d.modifiers.reduce((s, m) => s + m.priceDelta, 0),
        quantity: d.quantity,
        spiceLevel: d.spiceLevel,
        modifiers: d.modifiers,
        notes: d.notes,
        allergens: d.menuItem.allergens,
        status: "pending",
      }));
      const isDineIn = orderType === "dine-in";
      const optimistic: Order = {
        id,
        restaurantId: settings?.restaurantId ?? RESTAURANT_ID,
        orderNumber: nextOrderNumber, // provisional; the server allocates the real number
        channel: "POS",
        orderType,
        tableNumbers: isDineIn ? tableNumbers : undefined,
        guestCount: isDineIn ? guestCount : undefined,
        items,
        status: "pending",
        createdAt,
        staffName,
        staffId,
        paymentStatus: "unpaid",
        payments: [],
        tip: 0,
        syncStatus: "queued",
        discount: draftDiscount ?? undefined,
        deliveryDetails: draftCustomer ?? undefined,
        customerId: draftCustomer ? findCustomerByPhone(draftCustomer.phone)?.id : undefined,
        scheduledFor: draftScheduledFor ?? undefined,
        sentToKitchen: settings?.autoSendToKitchen ?? false,
      };
      setOrders((prev) => [...prev, optimistic]);

      const discount =
        draftDiscountInput?.kind === "promo"
          ? { kind: "promo", code: draftDiscountInput.code }
          : draftDiscountInput?.kind === "staff"
          ? {
              kind: "staff",
              percentOff: draftDiscountInput.percentOff,
              reason: draftDiscountInput.reason,
              approval: draftDiscountInput.approval
                ? { managerId: draftDiscountInput.approval.managerId, token: draftDiscountInput.approval.token }
                : undefined,
            }
          : undefined;

      enqueue(
        {
          type: "order.create",
          order: {
            id,
            orderType,
            tableNumbers: isDineIn ? tableNumbers : undefined,
            guestCount: isDineIn ? guestCount : undefined,
            items: draftLines.map((d) => ({
              lineId: d.lineId,
              menuItemId: d.menuItem.id,
              quantity: d.quantity,
              spiceLevel: d.spiceLevel,
              modifiers: d.modifiers.map((m) => ({ groupId: m.groupId, optionId: m.optionId })),
              notes: d.notes || undefined,
            })),
            discount,
            customer: draftCustomer
              ? { ...draftCustomer, town: draftCustomer.town || undefined }
              : undefined,
            scheduledFor: draftScheduledFor ?? undefined,
            createdAt,
          },
        },
        staffId
      );

      setDraftLines([]);
      setTableNumbers([]);
      setGuestCount(2);
      setDraftScheduledFor(null);
      setDraftDiscountInput(null);
      setDraftCustomer(null);
    },
    [
      draftLines,
      orderType,
      tableNumbers,
      guestCount,
      draftScheduledFor,
      draftDiscount,
      draftDiscountInput,
      draftCustomer,
      settings,
      nextOrderNumber,
      findCustomerByPhone,
      enqueue,
    ]
  );

  // ---------------------------------------------------------------- order actions
  const patchOrder = useCallback((orderId: string, fn: (o: Order) => Order) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? fn(o) : o)));
  }, []);

  const toggleOutOfStock = useCallback(
    (itemId: string) => {
      setMenuItems((prev) => prev.map((m) => (m.id === itemId ? { ...m, isOutOfStock: !m.isOutOfStock } : m)));
      enqueue({ type: "menu.toggleStock", itemId });
    },
    [enqueue]
  );

  const advanceLineStatus = useCallback(
    (orderId: string, lineId: string) => {
      patchOrder(orderId, (o) => {
        const items = o.items.map((it) => (it.lineId === lineId ? { ...it, status: nextStatus[it.status] } : it));
        return { ...o, items, status: computeOrderStatus(items) };
      });
      enqueue({ type: "order.line.advance", orderId, lineId });
    },
    [patchOrder, enqueue]
  );

  const flagLine = useCallback(
    (orderId: string, lineId: string, flag: "delayed" | "unavailable") => {
      patchOrder(orderId, (o) => ({
        ...o,
        items: o.items.map((it) =>
          it.lineId === lineId
            ? {
                ...it,
                flaggedDelayed: flag === "delayed" ? !it.flaggedDelayed : it.flaggedDelayed,
                flaggedUnavailable: flag === "unavailable" ? !it.flaggedUnavailable : it.flaggedUnavailable,
              }
            : it
        ),
      }));
      enqueue({ type: "order.line.flag", orderId, lineId, flag });
    },
    [patchOrder, enqueue]
  );

  const sendToKitchen = useCallback(
    (orderId: string) => {
      patchOrder(orderId, (o) => ({ ...o, sentToKitchen: true }));
      enqueue({ type: "order.sendToKitchen", orderId });
    },
    [patchOrder, enqueue]
  );

  const fireWaitingOrder = useCallback(
    (orderId: string) => {
      patchOrder(orderId, (o) => ({ ...o, scheduleReleased: true }));
      enqueue({ type: "order.fireWaiting", orderId });
    },
    [patchOrder, enqueue]
  );

  const simulateOnlineOrder = useCallback(() => {
    api("/api/demo/online-order", { method: "POST" })
      .then(() => kick.current())
      .catch((e) =>
        setSyncErrors((prev) => [
          ...prev,
          { opId: newClientId("demo"), type: "demo", message: e.message, at: Date.now() },
        ])
      );
  }, []);

  const recordPayment = useCallback(
    (
      orderId: string,
      payments: Array<{ method: PaymentMethod; amount: number; cashTendered?: number; changeGiven?: number }>,
      tip: number,
      staffId: string,
      serviceChargePercent?: number
    ) => {
      const withIds = payments.map((p) => ({ ...p, id: newClientId("pay") }));
      patchOrder(orderId, (o) => {
        const newPayments: Payment[] = withIds.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
          cashTendered: p.cashTendered,
          changeGiven: p.changeGiven,
          takenAt: Date.now(),
          takenByStaffId: staffId,
        }));
        const updated = {
          ...o,
          payments: [...o.payments, ...newPayments],
          tip: o.tip + tip,
          serviceChargePercent: serviceChargePercent !== undefined ? serviceChargePercent : o.serviceChargePercent,
        };
        const paid = amountPaidForItems(updated);
        const due = netSubtotal(updated) + serviceChargeAmount(updated);
        return { ...updated, paymentStatus: paid >= due - 0.01 ? "paid" : "partial" };
      });
      enqueue(
        {
          type: "order.pay",
          orderId,
          payments: withIds.map((p) => ({
            id: p.id,
            method: p.method,
            amount: +p.amount.toFixed(2),
            cashTendered: p.cashTendered != null ? +p.cashTendered.toFixed(2) : undefined,
            changeGiven: p.changeGiven != null ? +p.changeGiven.toFixed(2) : undefined,
          })),
          tip: +tip.toFixed(2),
          serviceChargePercent,
        },
        staffId
      );
    },
    [patchOrder, enqueue]
  );

  const mergeOrders = useCallback(
    (primaryOrderId: string, secondaryOrderId: string, staffId: string) => {
      setOrders((prev) => {
        const primary = prev.find((o) => o.id === primaryOrderId);
        const secondary = prev.find((o) => o.id === secondaryOrderId);
        if (!primary || !secondary || primary.id === secondary.id) return prev;
        const mergedItems = [...primary.items, ...secondary.items];
        const tables = Array.from(new Set([...(primary.tableNumbers ?? []), ...(secondary.tableNumbers ?? [])]));
        const base = {
          ...primary,
          items: mergedItems,
          tableNumbers: tables.length > 0 ? tables : undefined,
          guestCount: (primary.guestCount ?? 0) + (secondary.guestCount ?? 0) || undefined,
          status: computeOrderStatus(mergedItems),
          tip: primary.tip + secondary.tip,
          payments: [...primary.payments, ...secondary.payments],
        };
        const paid = amountPaidForItems(base);
        const due = netSubtotal(base);
        const merged: Order = {
          ...base,
          paymentStatus: paid <= 0.01 ? "unpaid" : paid >= due - 0.01 ? "paid" : "partial",
        };
        return prev.filter((o) => o.id !== secondaryOrderId).map((o) => (o.id === primaryOrderId ? merged : o));
      });
      enqueue({ type: "order.merge", primaryOrderId, secondaryOrderId }, staffId);
    },
    [enqueue]
  );

  const refundOrder = useCallback(
    (orderId: string, staffId: string, approval?: ManagerApproval | null) => {
      patchOrder(orderId, (o) => {
        const refundAmount = o.payments.reduce((s, p) => s + p.amount, 0) + o.tip;
        return {
          ...o,
          paymentStatus: "refunded",
          payments: [
            ...o.payments,
            {
              id: newClientId("refund"),
              method: o.payments[0]?.method ?? "card",
              amount: -refundAmount,
              takenAt: Date.now(),
              takenByStaffId: staffId,
            },
          ],
        };
      });
      enqueue(
        {
          type: "order.refund",
          orderId,
          approval: approval ? { managerId: approval.managerId, token: approval.token } : undefined,
        },
        staffId
      );
    },
    [patchOrder, enqueue]
  );

  const voidOrder = useCallback(
    (orderId: string, staffId: string, reason: string, approval?: ManagerApproval | null) => {
      patchOrder(orderId, (o) => ({ ...o, paymentStatus: "void", voidReason: reason }));
      enqueue(
        {
          type: "order.void",
          orderId,
          reason,
          approval: approval ? { managerId: approval.managerId, token: approval.token } : undefined,
        },
        staffId
      );
    },
    [patchOrder, enqueue]
  );

  // ---------------------------------------------------------------- till
  const currentTill = useMemo(() => tillSessions.find((t) => !t.closedAt) ?? null, [tillSessions]);

  const openTill = useCallback(
    (openingFloat: number, staffId: string) => {
      const tillId = newClientId("till");
      setTillSessions((prev) => [
        ...prev,
        {
          id: tillId,
          restaurantId: settings?.restaurantId ?? RESTAURANT_ID,
          openingFloat,
          openedAt: Date.now(),
          openedByStaffId: staffId,
          cashMovements: [],
        },
      ]);
      enqueue({ type: "till.open", tillId, openingFloat }, staffId);
    },
    [enqueue, settings]
  );

  const addCashMovement = useCallback(
    (type: "in" | "out", amount: number, reason: string, staffId: string) => {
      const movementId = newClientId("cash");
      setTillSessions((prev) =>
        prev.map((t) =>
          t.closedAt
            ? t
            : { ...t, cashMovements: [...t.cashMovements, { id: movementId, type, amount, reason, at: Date.now(), staffId }] }
        )
      );
      enqueue({ type: "till.cash", movementId, movementType: type, amount, reason }, staffId);
    },
    [enqueue]
  );

  const closeTill = useCallback(
    (countedCash: number, staffId: string) => {
      setTillSessions((prev) =>
        prev.map((t) => (t.closedAt ? t : { ...t, closedAt: Date.now(), countedCash, closedByStaffId: staffId }))
      );
      enqueue({ type: "till.close", countedCash }, staffId);
    },
    [enqueue]
  );

  // ---------------------------------------------------------------- context value
  const value = useMemo<StoreShape>(
    () => ({
      orders: ordersWithSync,
      menuItems,
      categories,
      promoCodes,
      settings,
      staffDirectory,
      staffNameById,
      nextOrderNumber,
      tillSessions,
      auditLog,
      customers,
      outboxCount: outbox.length,
      syncErrors,
      dismissSyncError,
      lastSyncedAt,
      bootstrapped: serverTime != null,
      refreshNow,
      draftLines,
      orderType,
      tableNumbers,
      addTableNumber,
      removeTableNumber,
      guestCount,
      setGuestCount,
      draftScheduledFor,
      setDraftScheduledFor,
      draftDiscount,
      draftCustomer,
      setDraftCustomer,
      findCustomerByPhone,
      addDraftLine,
      removeDraftLine,
      updateDraftQuantity,
      setOrderType,
      clearDraft,
      submitOrder,
      toggleOutOfStock,
      advanceLineStatus,
      flagLine,
      fireWaitingOrder,
      sendToKitchen,
      simulateOnlineOrder,
      recordPayment,
      refundOrder,
      voidOrder,
      mergeOrders,
      applyPromoCode,
      applyStaffDiscount,
      clearDraftDiscount,
      currentTill,
      openTill,
      addCashMovement,
      closeTill,
    }),
    [
      ordersWithSync, menuItems, categories, promoCodes, settings, staffDirectory, staffNameById,
      nextOrderNumber, tillSessions, auditLog, customers, outbox.length, syncErrors, dismissSyncError,
      lastSyncedAt, serverTime, refreshNow, draftLines, orderType, tableNumbers, addTableNumber,
      removeTableNumber, guestCount, draftScheduledFor, draftDiscount, draftCustomer, findCustomerByPhone,
      addDraftLine, removeDraftLine, updateDraftQuantity, clearDraft, submitOrder, toggleOutOfStock,
      advanceLineStatus, flagLine, fireWaitingOrder, sendToKitchen, simulateOnlineOrder, recordPayment,
      refundOrder, voidOrder, mergeOrders, applyPromoCode, applyStaffDiscount, clearDraftDiscount,
      currentTill, openTill, addCashMovement, closeTill,
    ]
  );

  if (!hydrated) return null;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

