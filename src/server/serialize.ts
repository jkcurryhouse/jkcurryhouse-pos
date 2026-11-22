import "server-only";
import { Prisma, Db, Tx } from "@/db";
import type {
  AuditLogEntry,
  Customer,
  MenuItem,
  Order,
  OrderDiscount,
  CustomerContactSnapshot,
  ModifierGroup,
  SelectedModifier,
  TillSession,
} from "@/lib/types";
import type {
  AuditLog as AuditRow,
  Customer as CustomerRow,
  MenuItem as MenuItemRow,
  Restaurant,
} from "@/generated/prisma/client";
import { toGbp } from "./http";

const ms = (d: Date | null | undefined) => (d ? d.getTime() : undefined);

/** Order with everything the POS needs */
export const orderInclude = {
  items: { orderBy: { position: "asc" }, include: { menuItem: { select: { name: true, allergens: true } } } },
  payments: { orderBy: { takenAt: "asc" } },
} satisfies Prisma.OrderInclude;
export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const ORDER_TYPE_FROM_DB: Record<string, Order["orderType"]> = { DELIVERY: "delivery", TAKEAWAY: "takeaway", DINE_IN: "dine-in" };
export const ORDER_TYPE_TO_DB = { delivery: "DELIVERY", takeaway: "TAKEAWAY", "dine-in": "DINE_IN" } as const;

/** Website lifecycle status that matches a POS kitchen status */
export const WEB_STATUS_FOR_KITCHEN = { pending: "CONFIRMED", preparing: "PREPARING", ready: "READY", served: "DELIVERED" } as const;

/** Website orders that haven't been paid yet (abandoned checkouts) never reach the POS. */
export const posVisibleOrders: Prisma.OrderWhereInput = {
  mergedIntoOrderId: null,
  NOT: { channel: "online", status: "PENDING", paymentStatus: "unpaid" },
};

const pence = (gbp: number) => Math.round(gbp * 100);

/** Payment status, defensive for website orders written by older website code. */
function paymentStatusOf(o: OrderWithRelations): Order["paymentStatus"] {
  if (o.channel === "online" && o.paymentStatus === "unpaid") {
    if (o.status === "CANCELLED") return "void";
    if (["CONFIRMED", "PREPARING", "READY", "DELIVERED"].includes(o.status)) return "paid";
  }
  return o.paymentStatus as Order["paymentStatus"];
}

function discountOf(o: OrderWithRelations): OrderDiscount | undefined {
  if (o.discount) return o.discount as unknown as OrderDiscount;
  if (o.discountAmount > 0)
    return {
      id: `web-${o.id}`,
      kind: "promo",
      code: o.discountCode ?? undefined,
      label: o.discountCode ? `Code ${o.discountCode}` : "Online discount",
      amount: o.discountAmount,
      appliedByStaffId: "online",
      appliedAt: o.createdAt.getTime(),
    };
  return undefined;
}

function contactOf(o: OrderWithRelations): CustomerContactSnapshot | undefined {
  if (o.deliveryDetails) return o.deliveryDetails as unknown as CustomerContactSnapshot;
  if (o.address || o.guestEmail)
    return { name: o.guestEmail ?? "Online customer", phone: "", postcode: "", addressLine1: o.address ?? "", street: "" };
  return undefined;
}

export function serializeOrder(o: OrderWithRelations): Order {
  const paymentStatus = paymentStatusOf(o);
  return {
    id: o.id,
    restaurantId: "anand-main",
    orderNumber: o.orderNumber,
    channel: o.channel === "POS" ? "POS" : "online",
    orderType: ORDER_TYPE_FROM_DB[o.type] ?? "takeaway",
    tableNumbers: o.tableNumbers.length ? o.tableNumbers : undefined,
    guestCount: o.guestCount ?? undefined,
    customerNote: o.customerNote ?? undefined,
    items: o.items.map((i) => ({
      lineId: i.id,
      menuItemId: i.menuItemId,
      name: i.name ?? i.menuItem?.name ?? "Item",
      unitPrice: i.price,
      quantity: i.quantity,
      spiceLevel: (i.spiceLevel ?? undefined) as Order["items"][number]["spiceLevel"],
      modifiers: (i.modifiers ?? []) as unknown as SelectedModifier[],
      notes: i.notes ?? undefined,
      allergens: (i.allergens.length ? i.allergens : i.menuItem?.allergens ?? []) as Order["items"][number]["allergens"],
      status: i.status as Order["status"],
      flaggedDelayed: i.flaggedDelayed || undefined,
      flaggedUnavailable: i.flaggedUnavailable || undefined,
    })),
    status: o.kitchenStatus as Order["status"],
    webStatus: o.status,
    createdAt: o.createdAt.getTime(),
    updatedAt: o.updatedAt.getTime(),
    staffName: o.staffName ?? (o.channel === "online" ? "Website" : "—"),
    staffId: o.staffId ?? undefined,
    paymentStatus,
    payments: o.payments.map((p) => ({
      id: p.id,
      method: p.method as "card" | "cash",
      amount: toGbp(p.amountPence),
      cashTendered: p.cashTenderedPence != null ? toGbp(p.cashTenderedPence) : undefined,
      changeGiven: p.changeGivenPence != null ? toGbp(p.changeGivenPence) : undefined,
      takenAt: p.takenAt.getTime(),
      takenByStaffId: p.takenByStaffId,
    })),
    tip: o.tip,
    deliveryFee: o.deliveryFee || undefined,
    voidReason: o.voidReason ?? undefined,
    syncStatus: "synced",
    discount: discountOf(o),
    // A paid website order goes straight to the kitchen
    sentToKitchen: o.sentToKitchen || (o.channel === "online" && paymentStatus === "paid"),
    serviceChargePercent: o.serviceChargePercent ?? undefined,
    scheduledFor: ms(o.scheduledFor),
    scheduleReleased: o.scheduleReleased || undefined,
    customerId: o.customerId ?? undefined,
    deliveryDetails: contactOf(o),
    mergedIntoOrderId: o.mergedIntoOrderId ?? undefined,
  };
}

/** Loads orders matching `where` with items and payments. */
export async function loadOrders(
  db: Db | Tx,
  where: Prisma.OrderWhereInput,
  opts: { limit?: number; skip?: number; orderBy?: "asc" | "desc" } = {}
): Promise<Order[]> {
  const rows = await db.order.findMany({
    where,
    include: orderInclude,
    orderBy: { createdAt: opts.orderBy ?? "asc" },
    take: opts.limit,
    skip: opts.skip,
  });
  return rows.map(serializeOrder);
}

export function serializeMenuItem(m: MenuItemRow): MenuItem {
  const groups = (m.modifierGroups ?? []) as unknown as ModifierGroup[];
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    price: m.price,
    categoryId: m.category,
    allergens: m.allergens as MenuItem["allergens"],
    dietary: m.dietary,
    isTodaysSpecial: m.isSpecial || undefined,
    isOutOfStock: !m.isAvailable || undefined,
    modifierGroups: groups.length ? groups : undefined,
    spiceLevelOptions: m.spiceLevelOptions.length ? (m.spiceLevelOptions as MenuItem["spiceLevelOptions"]) : undefined,
    sortOrder: m.sortOrder,
    active: m.active && m.availablePos,
    availableOnline: m.availableOnline,
    availablePos: m.availablePos,
    calories: m.calories ?? undefined,
    vatRateBasisPoints: m.vatRateBasisPoints ?? undefined,
    imageUrl: m.imageUrl ?? undefined,
    archived: !m.active,
  };
}

export { pence };

export function serializeCustomer(c: CustomerRow): Customer {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email ?? undefined,
    postcode: c.postcode,
    addressLine1: c.addressLine1,
    street: c.street,
    town: c.town ?? undefined,
    notes: c.notes ?? undefined,
    marketingOptIn: c.marketingOptIn,
    createdAt: c.createdAt.getTime(),
    updatedAt: c.updatedAt.getTime(),
    orderCount: c.orderCount,
    lastOrderAt: ms(c.lastOrderAt),
    anonymised: !!c.anonymisedAt || undefined,
  };
}

export function serializeAudit(a: AuditRow): AuditLogEntry {
  return {
    id: a.id,
    type: a.type as AuditLogEntry["type"],
    orderId: a.orderId ?? undefined,
    orderNumber: a.orderNumber ?? undefined,
    amount: a.amountPence != null ? toGbp(a.amountPence) : undefined,
    reason: a.reason,
    performedByStaffId: a.performedByStaffId,
    approvedByStaffId: a.approvedByStaffId ?? undefined,
    at: a.at.getTime(),
    meta: (a.meta as Record<string, unknown> | null) ?? undefined,
  };
}

export async function loadTillSessions(db: Db | Tx, where: Prisma.TillSessionWhereInput): Promise<TillSession[]> {
  const rows = await db.tillSession.findMany({
    where,
    include: { cashMovements: { orderBy: { at: "asc" } } },
    orderBy: { openedAt: "asc" },
  });
  return rows.map((t) => ({
    id: t.id,
    restaurantId: t.restaurantId,
    openingFloat: toGbp(t.openingFloatPence),
    openedAt: t.openedAt.getTime(),
    openedByStaffId: t.openedByStaffId,
    closedAt: ms(t.closedAt),
    countedCash: t.countedCashPence != null ? toGbp(t.countedCashPence) : undefined,
    expectedCash: t.expectedCashPence != null ? toGbp(t.expectedCashPence) : undefined,
    closedByStaffId: t.closedByStaffId ?? undefined,
    notes: t.notes ?? undefined,
    cashMovements: t.cashMovements.map((m) => ({
      id: m.id,
      type: m.type as "in" | "out",
      amount: toGbp(m.amountPence),
      reason: m.reason,
      at: m.at.getTime(),
      staffId: m.staffId,
    })),
  }));
}

export function serializeSettings(r: Restaurant) {
  return {
    restaurantId: r.id,
    name: r.name,
    legalName: r.legalName,
    tagline: r.tagline,
    addressLines: r.addressLines,
    phone: r.phone,
    email: r.email,
    vatNumber: r.vatNumber,
    companyNumber: r.companyNumber,
    receiptFooter: r.receiptFooter,
    vatRatePercent: r.vatRateBasisPoints / 100,
    defaultServiceChargePercent: r.defaultServiceChargePercent,
    serviceChargeMinGuests: r.serviceChargeMinGuests,
    inactivityLogoutMinutes: r.inactivityLogoutMinutes,
    autoSendToKitchen: r.autoSendToKitchen,
    kdsWarnMinutes: r.kdsWarnMinutes,
    tipPresets: r.tipPresets,
    timezone: r.timezone,
    updatedAt: r.updatedAt.getTime(),
  };
}
export type RestaurantSettings = ReturnType<typeof serializeSettings>;

/** Json? columns need Prisma.DbNull rather than a JS null. */
export const jsonOrNull = (v: unknown) =>
  v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
