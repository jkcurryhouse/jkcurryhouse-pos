"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { menuItems as seedMenuItems, promoCodes, RESTAURANT_ID } from "./mock-data";
import { useConnectivity } from "./connectivity";
import { netSubtotal, amountPaidForItems, serviceChargeAmount } from "./billing";
import {
  AuditLogEntry,
  Customer,
  CustomerContactSnapshot,
  MenuItem,
  Order,
  OrderDiscount,
  OrderLineItem,
  OrderStatus,
  OrderType,
  Payment,
  PaymentMethod,
  SelectedModifier,
  SpiceLevel,
  TillSession,
} from "./types";

const STORAGE_KEY = "anand-pos-demo-state-v6";

// TEMPORARY: the Kitchen Display isn't in use for now, so new orders don't
// automatically appear there — flip this back to true (or remove it) to
// resume routing every order to the KDS queue. The page itself, and the
// manual "Send to kitchen" action, still work regardless of this flag.
const AUTO_SEND_TO_KITCHEN_DISPLAY = false;

interface DraftLine {
  lineId: string;
  menuItem: MenuItem;
  quantity: number;
  spiceLevel?: SpiceLevel;
  modifiers: SelectedModifier[];
  notes?: string;
}

interface PersistedState {
  orders: Order[];
  menuItems: MenuItem[];
  nextOrderNumber: number;
  tillSessions: TillSession[];
  auditLog: AuditLogEntry[];
  customers: Customer[];
}

interface StoreShape extends PersistedState {
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
  toggleOutOfStock: (itemId: string) => void;
  advanceLineStatus: (orderId: string, lineId: string) => void;
  flagLine: (
    orderId: string,
    lineId: string,
    flag: "delayed" | "unavailable"
  ) => void;
  fireWaitingOrder: (orderId: string) => void;
  sendToKitchen: (orderId: string) => void;
  simulateOnlineOrder: () => void;
  recordPayment: (
    orderId: string,
    payments: Array<{
      method: PaymentMethod;
      amount: number;
      cashTendered?: number;
      changeGiven?: number;
    }>,
    tip: number,
    staffId: string,
    serviceChargePercent?: number
  ) => void;
  refundOrder: (orderId: string, staffId: string) => void;
  voidOrder: (orderId: string, staffId: string, reason: string) => void;
  mergeOrders: (primaryOrderId: string, secondaryOrderId: string, staffId: string) => void;
  applyPromoCode: (code: string, subtotal: number, staffId: string) => boolean;
  applyStaffDiscount: (
    percentOff: number,
    subtotal: number,
    reason: string,
    staffId: string,
    managerId: string
  ) => void;
  clearDraftDiscount: () => void;
  currentTill: TillSession | null;
  openTill: (openingFloat: number, staffId: string) => void;
  addCashMovement: (type: "in" | "out", amount: number, reason: string, staffId: string) => void;
  closeTill: (countedCash: number, staffId: string) => void;
}

const StoreContext = createContext<StoreShape | null>(null);

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// Strips everything but digits, and a leading UK "0"/"44" prefix wrinkle, so
// "07700 900123", "+44 7700 900123" and "447700900123" all match the same
// customer record.
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("44")) return "0" + digits.slice(2);
  return digits;
}

function computeOrderStatus(items: OrderLineItem[]): OrderStatus {
  if (items.every((i) => i.status === "served")) return "served";
  if (items.every((i) => i.status === "ready" || i.status === "served"))
    return "ready";
  if (items.some((i) => i.status === "preparing")) return "preparing";
  return "pending";
}

const nextStatus: Record<OrderStatus, OrderStatus> = {
  pending: "preparing",
  preparing: "ready",
  ready: "served",
  served: "served",
};

const ONLINE_SAMPLES: Array<{ itemId: string; qty: number }[]> = [
  [
    { itemId: "butter-chicken", qty: 1 },
    { itemId: "garlic-naan", qty: 2 },
    { itemId: "plain-rice", qty: 1 },
  ],
  [
    { itemId: "chicken-biryani", qty: 1 },
    { itemId: "papadum", qty: 1 },
  ],
  [
    { itemId: "saag-paneer", qty: 1 },
    { itemId: "roti", qty: 2 },
  ],
];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { isOnline } = useConnectivity();
  const [hydrated, setHydrated] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItemsState, setMenuItemsState] = useState<MenuItem[]>(seedMenuItems);
  const [nextOrderNumber, setNextOrderNumber] = useState(101);
  const [tillSessions, setTillSessions] = useState<TillSession[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("dine-in");
  const [tableNumbers, setTableNumbers] = useState<string[]>([]);
  const [guestCount, setGuestCount] = useState(2);
  const [draftScheduledFor, setDraftScheduledFor] = useState<number | null>(null);
  const [draftDiscount, setDraftDiscount] = useState<OrderDiscount | null>(null);
  const [draftCustomer, setDraftCustomer] = useState<CustomerContactSnapshot | null>(null);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: PersistedState = JSON.parse(raw);
        setOrders(parsed.orders ?? []);
        setMenuItemsState(parsed.menuItems ?? seedMenuItems);
        setNextOrderNumber(parsed.nextOrderNumber ?? 101);
        setTillSessions(parsed.tillSessions ?? []);
        setAuditLog(parsed.auditLog ?? []);
        setCustomers(parsed.customers ?? []);
      }
    } catch {
      // ignore corrupt state
    }
    setHydrated(true);
  }, []);

  // persist. In production this is where HMRC's 6-year transaction retention
  // requirement would be enforced server-side — this demo never deletes
  // orders/audit entries locally, but has no real long-term store.
  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedState = {
      orders,
      menuItems: menuItemsState,
      nextOrderNumber,
      tillSessions,
      auditLog,
      customers,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [orders, menuItemsState, nextOrderNumber, tillSessions, auditLog, customers, hydrated]);

  // Automatic sync on reconnect. Orders taken offline were already written to
  // local state (and localStorage) at creation time, so "syncing" here just
  // flips their status — each order keeps its original id, which is the
  // idempotency key a real backend would dedupe on.
  useEffect(() => {
    if (!hydrated || !isOnline) return;
    setOrders((prev) => {
      const hasQueued = prev.some((o) => o.syncStatus === "queued");
      if (!hasQueued) return prev;
      return prev.map((o) => (o.syncStatus === "queued" ? { ...o, syncStatus: "synced" } : o));
    });
  }, [isOnline, hydrated]);

  const addDraftLine = useCallback((line: Omit<DraftLine, "lineId">) => {
    setDraftLines((prev) => [...prev, { ...line, lineId: uid("line") }]);
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
      prev.map((l) =>
        l.lineId === lineId ? { ...l, quantity: Math.max(1, quantity) } : l
      )
    );
  }, []);

  const clearDraft = useCallback(() => {
    setDraftLines([]);
    setTableNumbers([]);
    setGuestCount(2);
    setDraftScheduledFor(null);
    setDraftDiscount(null);
    setDraftCustomer(null);
  }, []);

  const clearDraftDiscount = useCallback(() => setDraftDiscount(null), []);

  const findCustomerByPhone = useCallback(
    (phone: string) => {
      const normalised = normalisePhone(phone);
      if (!normalised) return undefined;
      return customers.find((c) => normalisePhone(c.phone) === normalised);
    },
    [customers]
  );

  // Upserts the customer record by phone number (the natural key shared with
  // the website's customer table) and returns its id, so an order can link
  // to it. Existing loyalty stats (orderCount, createdAt) are preserved.
  // Reads `customers` directly rather than via a setState updater so the id
  // is available synchronously to the caller (submitOrder needs it in the
  // same tick to stamp the order).
  const upsertCustomer = useCallback(
    (details: CustomerContactSnapshot): string => {
      const normalised = normalisePhone(details.phone);
      const existing = customers.find((c) => normalisePhone(c.phone) === normalised);
      if (existing) {
        const updatedAt = Date.now();
        setCustomers((prev) =>
          prev.map((c) => (c.id === existing.id ? { ...c, ...details, updatedAt } : c))
        );
        return existing.id;
      }
      const created: Customer = {
        ...details,
        id: uid("cust"),
        marketingOptIn: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        orderCount: 0,
      };
      setCustomers((prev) => [...prev, created]);
      return created.id;
    },
    [customers]
  );

  const applyPromoCode = useCallback(
    (code: string, subtotal: number, staffId: string) => {
      const match = promoCodes.find((p) => p.code.toUpperCase() === code.trim().toUpperCase());
      if (!match) return false;
      setDraftDiscount({
        id: uid("disc"),
        kind: "promo",
        code: match.code,
        label: match.label,
        amount: +(subtotal * (match.percentOff / 100)).toFixed(2),
        appliedByStaffId: staffId,
        appliedAt: Date.now(),
      });
      return true;
    },
    []
  );

  const applyStaffDiscount = useCallback(
    (
      percentOff: number,
      subtotal: number,
      reason: string,
      staffId: string,
      managerId: string
    ) => {
      const amount = +(subtotal * (percentOff / 100)).toFixed(2);
      setDraftDiscount({
        id: uid("disc"),
        kind: "staff",
        label: `Staff discount ${percentOff}% — ${reason}`,
        amount,
        appliedByStaffId: staffId,
        approvedByStaffId: managerId,
        appliedAt: Date.now(),
      });
      setAuditLog((prev) => [
        ...prev,
        {
          id: uid("audit"),
          type: "staff-discount",
          amount,
          reason,
          performedByStaffId: staffId,
          approvedByStaffId: managerId,
          at: Date.now(),
        },
      ]);
    },
    []
  );

  const submitOrder = useCallback(
    (staffName: string, staffId: string) => {
      // Save/refresh the customer record first (if any details were
      // captured) so we have an id to stamp on the order below.
      const customerId = draftCustomer ? upsertCustomer(draftCustomer) : undefined;

      setDraftLines((currentDraft) => {
        if (currentDraft.length === 0) return currentDraft;
        setNextOrderNumber((num) => {
          const items: OrderLineItem[] = currentDraft.map((d) => {
            const modTotal = d.modifiers.reduce((s, m) => s + m.priceDelta, 0);
            return {
              lineId: d.lineId,
              menuItemId: d.menuItem.id,
              name: d.menuItem.name,
              unitPrice: d.menuItem.price + modTotal,
              quantity: d.quantity,
              spiceLevel: d.spiceLevel,
              modifiers: d.modifiers,
              notes: d.notes,
              allergens: d.menuItem.allergens,
              status: "pending",
            };
          });
          const order: Order = {
            id: uid("order"),
            restaurantId: RESTAURANT_ID,
            orderNumber: num,
            channel: "POS",
            orderType,
            tableNumbers: orderType === "dine-in" ? tableNumbers : undefined,
            guestCount: orderType === "dine-in" ? guestCount : undefined,
            items,
            status: "pending",
            createdAt: Date.now(),
            staffName,
            staffId,
            paymentStatus: "unpaid",
            payments: [],
            tip: 0,
            syncStatus: isOnline ? "synced" : "queued",
            discount: draftDiscount ?? undefined,
            customerId,
            deliveryDetails: draftCustomer ?? undefined,
            scheduledFor: draftScheduledFor ?? undefined,
            sentToKitchen: AUTO_SEND_TO_KITCHEN_DISPLAY,
          };
          setOrders((prev) => [...prev, order]);
          return num + 1;
        });
        return [];
      });

      if (customerId) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === customerId
              ? { ...c, orderCount: c.orderCount + 1, lastOrderAt: Date.now() }
              : c
          )
        );
      }

      setTableNumbers([]);
      setGuestCount(2);
      setDraftScheduledFor(null);
      setDraftDiscount(null);
      setDraftCustomer(null);
    },
    [
      orderType,
      tableNumbers,
      guestCount,
      draftScheduledFor,
      isOnline,
      draftDiscount,
      draftCustomer,
      upsertCustomer,
    ]
  );

  const toggleOutOfStock = useCallback((itemId: string) => {
    setMenuItemsState((prev) =>
      prev.map((m) =>
        m.id === itemId ? { ...m, isOutOfStock: !m.isOutOfStock } : m
      )
    );
  }, []);

  const advanceLineStatus = useCallback((orderId: string, lineId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const items = o.items.map((it) =>
          it.lineId === lineId ? { ...it, status: nextStatus[it.status] } : it
        );
        return { ...o, items, status: computeOrderStatus(items) };
      })
    );
  }, []);

  const flagLine = useCallback(
    (orderId: string, lineId: string, flag: "delayed" | "unavailable") => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const items = o.items.map((it) =>
            it.lineId === lineId
              ? {
                  ...it,
                  flaggedDelayed: flag === "delayed" ? !it.flaggedDelayed : it.flaggedDelayed,
                  flaggedUnavailable:
                    flag === "unavailable" ? !it.flaggedUnavailable : it.flaggedUnavailable,
                }
              : it
          );
          return { ...o, items };
        })
      );
    },
    []
  );

  // Manual override so a specific order can still reach the kitchen queue
  // even while AUTO_SEND_TO_KITCHEN_DISPLAY is off.
  const sendToKitchen = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, sentToKitchen: true } : o))
    );
  }, []);

  // Moves a scheduled order out of the "Waiting" queue and into the kitchen's
  // normal Pending column immediately — either because staff chose to start
  // it early, or because its scheduled time has arrived. scheduledFor itself
  // is left untouched so the customer's original requested time still shows
  // correctly on the ticket and receipt.
  const fireWaitingOrder = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, scheduleReleased: true } : o))
    );
  }, []);

  const simulateOnlineOrder = useCallback(() => {
    const sample = ONLINE_SAMPLES[Math.floor(Math.random() * ONLINE_SAMPLES.length)];
    setNextOrderNumber((num) => {
      const items: OrderLineItem[] = sample.map(({ itemId, qty }) => {
        const menuItem = seedMenuItems.find((m) => m.id === itemId)!;
        return {
          lineId: uid("line"),
          menuItemId: menuItem.id,
          name: menuItem.name,
          unitPrice: menuItem.price,
          quantity: qty,
          modifiers: [],
          allergens: menuItem.allergens,
          status: "pending",
        };
      });
      const order: Order = {
        id: uid("order"),
        restaurantId: RESTAURANT_ID,
        orderNumber: num,
        channel: "online",
        orderType: "delivery",
        items,
        status: "pending",
        createdAt: Date.now(),
        staffName: "Website",
        paymentStatus: "paid",
        payments: [
          {
            id: uid("pay"),
            method: "card",
            amount: sample.reduce((s, { itemId, qty }) => {
              const mi = seedMenuItems.find((m) => m.id === itemId)!;
              return s + mi.price * qty;
            }, 0),
            takenAt: Date.now(),
            takenByStaffId: "online",
          },
        ],
        tip: 0,
        syncStatus: "synced",
        // Unlike POS orders (see AUTO_SEND_TO_KITCHEN_DISPLAY), this demo
        // button exists specifically to show incoming online orders landing
        // on the KDS, so it always sends through regardless of that flag.
        sentToKitchen: true,
      };
      setOrders((prev) => [...prev, order]);
      return num + 1;
    });
  }, []);

  const recordPayment = useCallback(
    (
      orderId: string,
      payments: Array<{
        method: PaymentMethod;
        amount: number;
        cashTendered?: number;
        changeGiven?: number;
      }>,
      tip: number,
      staffId: string,
      serviceChargePercent?: number
    ) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const newPayments: Payment[] = payments.map((p) => ({
            id: uid("pay"),
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
            // Only overwrite if this call actually specifies a service
            // charge — repeated/partial payment calls on the same order
            // (e.g. topping up a balance) shouldn't reset it to undefined.
            serviceChargePercent:
              serviceChargePercent !== undefined ? serviceChargePercent : o.serviceChargePercent,
          };
          const paidTowardItems = amountPaidForItems(updated);
          const due = netSubtotal(updated) + serviceChargeAmount(updated);
          const isFullyPaid = paidTowardItems >= due - 0.01;
          return { ...updated, paymentStatus: isFullyPaid ? "paid" : "partial" };
        })
      );
    },
    []
  );

  const mergeOrders = useCallback(
    (primaryOrderId: string, secondaryOrderId: string, staffId: string) => {
      setOrders((prev) => {
        const primary = prev.find((o) => o.id === primaryOrderId);
        const secondary = prev.find((o) => o.id === secondaryOrderId);
        if (!primary || !secondary || primary.id === secondary.id) return prev;
        const mergedItems = [...primary.items, ...secondary.items];
        const mergedTableNumbers = Array.from(
          new Set([...(primary.tableNumbers ?? []), ...(secondary.tableNumbers ?? [])])
        );
        const mergedBase = {
          ...primary,
          items: mergedItems,
          tableNumbers: mergedTableNumbers.length > 0 ? mergedTableNumbers : undefined,
          guestCount:
            (primary.guestCount ?? 0) + (secondary.guestCount ?? 0) || undefined,
          status: computeOrderStatus(mergedItems),
          tip: primary.tip + secondary.tip,
          payments: [...primary.payments, ...secondary.payments],
        };
        const paidTowardItems = amountPaidForItems(mergedBase);
        const due = netSubtotal(mergedBase);
        const merged: Order = {
          ...mergedBase,
          paymentStatus:
            paidTowardItems <= 0.01 ? "unpaid" : paidTowardItems >= due - 0.01 ? "paid" : "partial",
        };
        setAuditLog((log) => [
          ...log,
          {
            id: uid("audit"),
            type: "manager-override",
            orderId: primary.id,
            orderNumber: primary.orderNumber,
            reason: `Merged order #${secondary.orderNumber} into #${primary.orderNumber}`,
            performedByStaffId: staffId,
            at: Date.now(),
          },
        ]);
        return prev
          .filter((o) => o.id !== secondaryOrderId)
          .map((o) => (o.id === primaryOrderId ? merged : o));
      });
    },
    []
  );

  const refundOrder = useCallback((orderId: string, staffId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const refundAmount = o.payments.reduce((s, p) => s + p.amount, 0) + o.tip;
        setAuditLog((log) => [
          ...log,
          {
            id: uid("audit"),
            type: "refund",
            orderId: o.id,
            orderNumber: o.orderNumber,
            amount: refundAmount,
            reason: "Full refund",
            performedByStaffId: staffId,
            at: Date.now(),
          },
        ]);
        return {
          ...o,
          paymentStatus: "refunded",
          payments: [
            ...o.payments,
            {
              id: uid("refund"),
              method: o.payments[0]?.method ?? "card",
              amount: -refundAmount,
              takenAt: Date.now(),
              takenByStaffId: staffId,
            },
          ],
        };
      })
    );
  }, []);

  const voidOrder = useCallback((orderId: string, staffId: string, reason: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        setAuditLog((log) => [
          ...log,
          {
            id: uid("audit"),
            type: "void",
            orderId: o.id,
            orderNumber: o.orderNumber,
            reason,
            performedByStaffId: staffId,
            at: Date.now(),
          },
        ]);
        return { ...o, paymentStatus: "void", voidReason: reason };
      })
    );
  }, []);

  const currentTill = useMemo(
    () => tillSessions.find((t) => !t.closedAt) ?? null,
    [tillSessions]
  );

  const openTill = useCallback((openingFloat: number, staffId: string) => {
    setTillSessions((prev) => [
      ...prev,
      {
        id: uid("till"),
        restaurantId: RESTAURANT_ID,
        openingFloat,
        openedAt: Date.now(),
        openedByStaffId: staffId,
        cashMovements: [],
      },
    ]);
  }, []);

  const addCashMovement = useCallback(
    (type: "in" | "out", amount: number, reason: string, staffId: string) => {
      setTillSessions((prev) =>
        prev.map((t) =>
          t.closedAt
            ? t
            : {
                ...t,
                cashMovements: [
                  ...t.cashMovements,
                  { id: uid("cash"), type, amount, reason, at: Date.now(), staffId },
                ],
              }
        )
      );
    },
    []
  );

  const closeTill = useCallback((countedCash: number, staffId: string) => {
    setTillSessions((prev) =>
      prev.map((t) =>
        t.closedAt ? t : { ...t, closedAt: Date.now(), countedCash, closedByStaffId: staffId }
      )
    );
  }, []);

  const value = useMemo<StoreShape>(
    () => ({
      orders,
      menuItems: menuItemsState,
      nextOrderNumber,
      tillSessions,
      auditLog,
      customers,
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
      orders,
      menuItemsState,
      nextOrderNumber,
      tillSessions,
      auditLog,
      customers,
      draftLines,
      orderType,
      tableNumbers,
      addTableNumber,
      removeTableNumber,
      guestCount,
      draftScheduledFor,
      draftDiscount,
      draftCustomer,
      findCustomerByPhone,
      addDraftLine,
      removeDraftLine,
      updateDraftQuantity,
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
