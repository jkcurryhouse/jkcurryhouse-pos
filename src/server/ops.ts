import "server-only";
/**
 * Authoritative order / till / stock mutations.
 *
 * The POS writes optimistically to its local state and queues each change as an "op"
 * in an outbox (so order-taking never blocks on the network). Ops are POSTed to
 * /api/ops and applied here inside a transaction, exactly once per op id. The server
 * re-derives everything money-related (prices from the menu table, promo amounts,
 * payment status) rather than trusting the client's numbers.
 */
import { z } from "zod";
import { getDb, Prisma, Tx } from "@/db";
import type { Order, OrderStatus, ModifierGroup } from "@/lib/types";
import { amountPaidForItems, netSubtotal, serviceChargeAmount } from "@/lib/billing";
import { hasRole, SessionStaff, verifyApprovalToken } from "./auth";
import { ApiError, badRequest, conflict, forbidden, newId, notFound, toPence } from "./http";
import { orderInclude, serializeOrder, jsonOrNull, ORDER_TYPE_TO_DB, WEB_STATUS_FOR_KITCHEN } from "./serialize";
import { writeAudit, RESTAURANT_ID } from "./audit";
import { normalisePhone } from "@/lib/phone";

export { RESTAURANT_ID };

const money = z.number().finite().min(0).max(100000);
const approval = z.object({ managerId: z.string(), token: z.string() }).optional();

const contact = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(30),
  postcode: z.string().trim().max(12),
  addressLine1: z.string().trim().max(120),
  street: z.string().trim().max(160),
  town: z.string().trim().max(80).optional(),
});

const lineInput = z.object({
  lineId: z.string().min(1).max(80),
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(200),
  spiceLevel: z.enum(["mild", "medium", "hot", "extra-hot"]).optional(),
  modifiers: z
    .array(z.object({ groupId: z.string(), optionId: z.string() }))
    .max(30)
    .default([]),
  notes: z.string().max(300).optional(),
});

const discountInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("promo"), code: z.string().trim().min(1).max(40) }),
  z.object({
    kind: z.literal("staff"),
    percentOff: z.number().min(0).max(100),
    reason: z.string().trim().min(1).max(200),
    approval,
  }),
]);

export const opSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("order.create"),
    order: z.object({
      id: z.string().min(4).max(80),
      orderType: z.enum(["dine-in", "takeaway", "delivery"]),
      tableNumbers: z.array(z.string().trim().min(1).max(10)).max(12).optional(),
      guestCount: z.number().int().min(1).max(200).optional(),
      customerNote: z.string().max(500).optional(),
      items: z.array(lineInput).min(1).max(200),
      discount: discountInput.optional(),
      customer: contact.optional(),
      scheduledFor: z.number().int().optional(),
      createdAt: z.number().int(),
    }),
  }),
  z.object({ type: z.literal("order.line.advance"), orderId: z.string(), lineId: z.string() }),
  z.object({
    type: z.literal("order.line.flag"),
    orderId: z.string(),
    lineId: z.string(),
    flag: z.enum(["delayed", "unavailable"]),
  }),
  z.object({ type: z.literal("order.sendToKitchen"), orderId: z.string() }),
  z.object({ type: z.literal("order.fireWaiting"), orderId: z.string() }),
  z.object({
    type: z.literal("order.pay"),
    orderId: z.string(),
    payments: z
      .array(
        z.object({
          id: z.string().min(4).max(80),
          method: z.enum(["card", "cash"]),
          amount: money,
          cashTendered: money.optional(),
          changeGiven: money.optional(),
          stripePaymentIntentId: z.string().max(80).optional(),
        })
      )
      .min(1)
      .max(20),
    tip: money.default(0),
    serviceChargePercent: z.number().min(0).max(25).optional(),
  }),
  z.object({ type: z.literal("order.refund"), orderId: z.string(), approval, reason: z.string().max(200).optional() }),
  z.object({
    type: z.literal("order.void"),
    orderId: z.string(),
    reason: z.string().trim().min(1).max(200),
    approval,
  }),
  z.object({
    type: z.literal("order.merge"),
    primaryOrderId: z.string(),
    secondaryOrderId: z.string(),
  }),
  z.object({ type: z.literal("menu.toggleStock"), itemId: z.string() }),
  z.object({ type: z.literal("till.open"), tillId: z.string().min(4).max(80), openingFloat: money }),
  z.object({
    type: z.literal("till.cash"),
    movementId: z.string().min(4).max(80),
    movementType: z.enum(["in", "out"]),
    amount: money,
    reason: z.string().trim().min(1).max(200),
  }),
  z.object({
    type: z.literal("till.close"),
    countedCash: money,
    notes: z.string().max(500).optional(),
  }),
]);

export const envelopeSchema = z.object({
  id: z.string().min(4).max(100), // op id = idempotency key
  staffId: z.string(), // who did it on the terminal (may differ from the session if queued offline)
  at: z.number().int(),
  op: opSchema,
});
export type OpEnvelope = z.infer<typeof envelopeSchema>;
type Op = z.infer<typeof opSchema>;

export type OpResult = {
  opId: string;
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  orders?: Order[];
  menuItemIds?: string[];
  tillChanged?: boolean;
  retry?: boolean;
};

interface Actor {
  /** staff member credited with the action (from the op) */
  staffId: string;
  staffName: string;
  /** the authenticated terminal session — its role is what grants authority */
  session: SessionStaff;
  ip: string;
}

// ---------------------------------------------------------------- helpers
const nextStatus: Record<OrderStatus, OrderStatus> = {
  pending: "preparing",
  preparing: "ready",
  ready: "served",
  served: "served",
};

function computeOrderStatus(items: { status: string }[]): OrderStatus {
  if (items.length === 0) return "pending";
  if (items.every((i) => i.status === "served")) return "served";
  if (items.every((i) => i.status === "ready" || i.status === "served")) return "ready";
  if (items.some((i) => i.status !== "pending")) return "preparing";
  return "pending";
}

/** Kitchen status + the matching website lifecycle status (left alone once cancelled). */
function kitchenFields(o: Order, kitchen: OrderStatus): Prisma.OrderUncheckedUpdateInput {
  if (o.webStatus === "CANCELLED") return { kitchenStatus: kitchen };
  // Website orders stay CONFIRMED until the kitchen actually starts them
  const web = kitchen === "pending" ? (o.webStatus === "PENDING" ? "PENDING" : "CONFIRMED") : WEB_STATUS_FOR_KITCHEN[kitchen];
  return { kitchenStatus: kitchen, status: web as Prisma.OrderUncheckedUpdateInput["status"] };
}

async function requireManagerAuthority(actor: Actor, appr: { managerId: string; token: string } | undefined): Promise<string> {
  if (hasRole(actor.session.role, "manager")) return actor.session.id;
  const managerId = await verifyApprovalToken(appr?.token);
  if (!managerId) throw forbidden("A manager must authorise this (approval missing or expired)");
  return managerId;
}

async function loadOrder(tx: Tx, id: string): Promise<Order> {
  const o = await tx.order.findUnique({ where: { id }, include: orderInclude });
  if (!o) throw notFound(`Order ${id} not found`);
  return serializeOrder(o);
}

/** Row-locks the order for the rest of the transaction, then returns it. */
async function lockOrder(tx: Tx, id: string): Promise<Order> {
  const rows = await tx.$queryRaw<{ id: string }[]>`select id from "Order" where id = ${id} for update`;
  if (rows.length === 0) throw notFound(`Order ${id} not found`);
  return loadOrder(tx, id);
}

async function reload(tx: Tx, ids: string[]) {
  const rows = await tx.order.findMany({ where: { id: { in: ids } }, include: orderInclude });
  return rows.map(serializeOrder);
}

function derivePaymentStatus(o: Order): Order["paymentStatus"] {
  const paid = amountPaidForItems(o);
  const due = netSubtotal(o) + serviceChargeAmount(o);
  if (paid <= 0.005) return due <= 0.005 && o.payments.length > 0 ? "paid" : "unpaid";
  return paid >= due - 0.01 ? "paid" : "partial";
}

/** Amount due incl. service charge and tip — kept in the website's `total` column. */
const totalOf = (o: Order) => +(netSubtotal(o) + serviceChargeAmount(o) + o.tip).toFixed(2);

async function openTill(tx: Tx) {
  return tx.tillSession.findFirst({ where: { restaurantId: RESTAURANT_ID, closedAt: null } });
}

// ---------------------------------------------------------------- handlers
async function createOrder(tx: Tx, actor: Actor, input: Extract<Op, { type: "order.create" }>["order"]) {
  if (await tx.order.findUnique({ where: { id: input.id }, select: { id: true } })) return reload(tx, [input.id]);
  const settings = await tx.restaurant.findUnique({ where: { id: RESTAURANT_ID } });
  if (!settings) throw new ApiError(500, "Restaurant settings row missing — run the seed");

  // Price every line from the shared menu table — never from the client.
  const menu = await tx.menuItem.findMany({ where: { id: { in: Array.from(new Set(input.items.map((i) => i.menuItemId))) } } });
  const byId = new Map(menu.map((m) => [m.id, m]));

  let subtotalPence = 0;
  const lines = input.items.map((line, position) => {
    const mi = byId.get(line.menuItemId);
    if (!mi) throw badRequest(`Unknown menu item ${line.menuItemId}`);
    const groups = (mi.modifierGroups ?? []) as unknown as ModifierGroup[];
    const mods = line.modifiers.map((sel) => {
      const group = groups.find((g) => g.id === sel.groupId);
      const opt = group?.options.find((o) => o.id === sel.optionId);
      if (!group || !opt) throw badRequest(`Unknown option ${sel.groupId}/${sel.optionId} on ${mi.name}`);
      return { groupId: group.id, groupLabel: group.label, optionId: opt.id, optionLabel: opt.label, priceDelta: opt.priceDelta };
    });
    const unitPricePence = toPence(mi.price) + mods.reduce((s, m) => s + toPence(m.priceDelta), 0);
    subtotalPence += unitPricePence * line.quantity;
    return {
      id: line.lineId,
      position,
      menuItemId: mi.id,
      name: mi.name,
      price: unitPricePence / 100,
      quantity: line.quantity,
      spiceLevel: line.spiceLevel ?? null,
      modifiers: mods as unknown as Prisma.InputJsonValue,
      notes: line.notes ?? null,
      allergens: mi.allergens,
      status: "pending",
    };
  });

  // Discounts (promo codes are the website's Offer table)
  let discount: Record<string, unknown> | null = null;
  let discountPence = 0;
  let discountCode: string | null = null;
  let staffDiscountApproval: { managerId: string; reason: string } | null = null;
  const now = new Date();
  if (input.discount?.kind === "promo") {
    const code = input.discount.code.toUpperCase();
    const offer = await tx.offer.findUnique({ where: { code } });
    const valid =
      offer &&
      offer.active &&
      offer.isGeneral &&
      offer.channels.includes("POS") &&
      (!offer.validFrom || offer.validFrom <= now) &&
      offer.expiresAt >= now &&
      (offer.maxUses == null || offer.useCount < offer.maxUses) &&
      subtotalPence >= toPence(offer.minSpend);
    if (!valid) throw badRequest(`Promo code ${code} is not valid for this order`);
    discountPence = offer.isPercent
      ? Math.round(subtotalPence * (offer.discount / 100))
      : Math.min(toPence(offer.discount), subtotalPence);
    discountCode = offer.code;
    discount = {
      id: newId("disc"),
      kind: "promo",
      code: offer.code,
      label: offer.title,
      amount: discountPence / 100,
      appliedByStaffId: actor.staffId,
      appliedAt: now.getTime(),
    };
    await tx.offer.update({ where: { id: offer.id }, data: { useCount: { increment: 1 } } });
  } else if (input.discount?.kind === "staff") {
    const managerId = await requireManagerAuthority(actor, input.discount.approval);
    discountPence = Math.round(subtotalPence * (input.discount.percentOff / 100));
    discount = {
      id: newId("disc"),
      kind: "staff",
      label: `Staff discount ${input.discount.percentOff}% — ${input.discount.reason}`,
      amount: discountPence / 100,
      appliedByStaffId: actor.staffId,
      approvedByStaffId: managerId,
      appliedAt: now.getTime(),
    };
    staffDiscountApproval = { managerId, reason: input.discount.reason };
  }

  // Customer upsert (phone-keyed till customers)
  let customerId: string | null = null;
  if (input.customer) {
    const c = input.customer;
    const contact = { name: c.name, phone: c.phone, postcode: c.postcode, addressLine1: c.addressLine1, street: c.street, town: c.town ?? null };
    const row = await tx.customer.upsert({
      where: { restaurantId_phoneNormalised: { restaurantId: RESTAURANT_ID, phoneNormalised: normalisePhone(c.phone) } },
      create: { id: newId("cust"), restaurantId: RESTAURANT_ID, phoneNormalised: normalisePhone(c.phone), ...contact, orderCount: 1, lastOrderAt: now },
      update: { ...contact, orderCount: { increment: 1 }, lastOrderAt: now, anonymisedAt: null },
      select: { id: true },
    });
    customerId = row.id;
  }

  // OrderItem ids are global on the shared table: replace any client line id that's already taken.
  const taken = new Set(
    (await tx.orderItem.findMany({ where: { id: { in: lines.map((l) => l.id) } }, select: { id: true } })).map((r) => r.id)
  );
  const seen = new Set<string>();
  for (const l of lines) {
    if (taken.has(l.id) || seen.has(l.id)) l.id = newId("line");
    seen.add(l.id);
  }

  const isDineIn = input.orderType === "dine-in";
  const c = input.customer;
  const created = await tx.order.create({
    data: {
      id: input.id,
      type: ORDER_TYPE_TO_DB[input.orderType],
      status: "CONFIRMED",
      total: Math.max(0, subtotalPence - discountPence) / 100,
      channel: "POS",
      address: c ? [c.addressLine1, c.street, c.town, c.postcode].filter(Boolean).join(", ") : null,
      tableNumbers: isDineIn ? input.tableNumbers ?? [] : [],
      guestCount: isDineIn ? input.guestCount ?? null : null,
      customerNote: input.customerNote ?? null,
      staffName: actor.staffName,
      staffId: actor.staffId,
      discount: jsonOrNull(discount),
      discountAmount: discountPence / 100,
      discountCode,
      sentToKitchen: settings.autoSendToKitchen,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      customerId,
      deliveryDetails: jsonOrNull(c),
      createdAt: new Date(Math.min(input.createdAt, Date.now())),
      items: { create: lines },
    },
    select: { orderNumber: true },
  });
  if (staffDiscountApproval) {
    await writeAudit(tx, {
      type: "staff-discount",
      orderId: input.id,
      orderNumber: created.orderNumber,
      amountPence: discountPence,
      reason: staffDiscountApproval.reason,
      performedByStaffId: actor.staffId,
      approvedByStaffId: staffDiscountApproval.managerId,
      ip: actor.ip,
    });
  }
  return reload(tx, [input.id]);
}

const touch = (tx: Tx, orderId: string, data: Prisma.OrderUncheckedUpdateInput = {}) =>
  tx.order.update({ where: { id: orderId }, data });

async function applyOp(tx: Tx, actor: Actor, op: Op): Promise<Omit<OpResult, "opId" | "ok">> {
  switch (op.type) {
    case "order.create":
      return { orders: await createOrder(tx, actor, op.order) };

    case "order.line.advance":
    case "order.line.flag": {
      const o = await lockOrder(tx, op.orderId);
      const line = o.items.find((i) => i.lineId === op.lineId);
      if (!line) throw notFound("Line not found on order");
      if (op.type === "order.line.advance") {
        line.status = nextStatus[line.status];
        await tx.orderItem.update({ where: { id: line.lineId }, data: { status: line.status } });
        await touch(tx, o.id, kitchenFields(o, computeOrderStatus(o.items)));
      } else {
        await tx.orderItem.update({
          where: { id: line.lineId },
          data: op.flag === "delayed" ? { flaggedDelayed: !line.flaggedDelayed } : { flaggedUnavailable: !line.flaggedUnavailable },
        });
        await touch(tx, o.id);
      }
      return { orders: await reload(tx, [o.id]) };
    }

    case "order.sendToKitchen":
      await lockOrder(tx, op.orderId);
      await touch(tx, op.orderId, { sentToKitchen: true });
      return { orders: await reload(tx, [op.orderId]) };

    case "order.fireWaiting":
      await lockOrder(tx, op.orderId);
      await touch(tx, op.orderId, { scheduleReleased: true });
      return { orders: await reload(tx, [op.orderId]) };

    case "order.pay": {
      const o = await lockOrder(tx, op.orderId);
      if (o.paymentStatus === "void" || o.paymentStatus === "refunded")
        throw conflict(`Order #${o.orderNumber} is ${o.paymentStatus} and can't take payments`);
      if (o.mergedIntoOrderId) throw conflict("This ticket was merged into another order");
      const takenAt = new Date();
      await tx.payment.createMany({
        data: op.payments.map((p) => ({
          id: p.id,
          orderId: o.id,
          method: p.method,
          amountPence: toPence(p.amount),
          cashTenderedPence: p.cashTendered != null ? toPence(p.cashTendered) : null,
          changeGivenPence: p.changeGiven != null ? toPence(p.changeGiven) : null,
          stripePaymentIntentId: p.stripePaymentIntentId ?? null,
          takenAt,
          takenByStaffId: actor.staffId,
        })),
        skipDuplicates: true,
      });
      const after = await loadOrder(tx, o.id);
      const scp = op.serviceChargePercent !== undefined ? op.serviceChargePercent : after.serviceChargePercent;
      const next = { ...after, tip: +(after.tip + op.tip).toFixed(2), serviceChargePercent: scp };
      await touch(tx, o.id, {
        tip: next.tip,
        serviceChargePercent: scp ?? null,
        paymentStatus: derivePaymentStatus(next),
        total: totalOf(next),
      });
      return { orders: await reload(tx, [o.id]) };
    }

    case "order.refund": {
      const managerId = await requireManagerAuthority(actor, op.approval);
      const o = await lockOrder(tx, op.orderId);
      if (o.paymentStatus === "refunded") return { orders: [o] };
      const takenPence = o.payments.reduce((s, p) => s + toPence(p.amount), 0) + toPence(o.tip);
      if (takenPence <= 0) throw conflict("Nothing has been paid on this order to refund");
      // Refund to each method in proportion to what was taken on it. Card refunds for
      // website orders still have to be issued in Stripe — this records them.
      const byMethod = new Map<string, number>();
      for (const p of o.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + toPence(p.amount));
      // Tips are per order: refund them on the method of the last payment (normally the card machine).
      const tipMethod = [...o.payments].reverse().find((p) => p.amount > 0)?.method ?? "card";
      byMethod.set(tipMethod, (byMethod.get(tipMethod) ?? 0) + toPence(o.tip));
      const refundedAt = new Date();
      for (const [method, p] of Array.from(byMethod.entries())) {
        if (p <= 0) continue;
        await tx.payment.create({
          data: { id: newId("refund"), orderId: o.id, method, amountPence: -p, takenAt: refundedAt, takenByStaffId: actor.staffId },
        });
      }
      await touch(tx, o.id, { paymentStatus: "refunded", status: "CANCELLED" });
      await writeAudit(tx, {
        type: "refund",
        orderId: o.id,
        orderNumber: o.orderNumber,
        amountPence: takenPence,
        reason: op.reason ?? (o.channel === "online" ? "Full refund — also refund the card payment in Stripe" : "Full refund"),
        performedByStaffId: actor.staffId,
        approvedByStaffId: managerId,
        ip: actor.ip,
      });
      return { orders: await reload(tx, [o.id]) };
    }

    case "order.void": {
      const managerId = await requireManagerAuthority(actor, op.approval);
      const o = await lockOrder(tx, op.orderId);
      if (o.paymentStatus === "void") return { orders: [o] };
      if (amountPaidForItems(o) > 0.005) throw conflict("This order has payments on it — refund it instead of voiding");
      await touch(tx, o.id, { paymentStatus: "void", status: "CANCELLED", voidReason: op.reason });
      await writeAudit(tx, {
        type: "void",
        orderId: o.id,
        orderNumber: o.orderNumber,
        reason: op.reason,
        performedByStaffId: actor.staffId,
        approvedByStaffId: managerId,
        ip: actor.ip,
      });
      return { orders: await reload(tx, [o.id]) };
    }

    case "order.merge": {
      if (op.primaryOrderId === op.secondaryOrderId) throw badRequest("Can't merge an order into itself");
      // lock in a stable order so two terminals merging the same pair can't deadlock
      for (const id of [op.primaryOrderId, op.secondaryOrderId].sort()) await lockOrder(tx, id);
      const primary = await loadOrder(tx, op.primaryOrderId);
      const secondary = await loadOrder(tx, op.secondaryOrderId);
      for (const o of [primary, secondary]) {
        if (o.mergedIntoOrderId) throw conflict(`Order #${o.orderNumber} was already merged`);
        if (o.channel === "online") throw conflict("Website orders can't be merged");
        if (o.paymentStatus === "void" || o.paymentStatus === "refunded" || o.paymentStatus === "paid")
          throw conflict(`Order #${o.orderNumber} is ${o.paymentStatus} — only open tickets can be merged`);
      }
      for (const [i, it] of secondary.items.entries()) {
        await tx.orderItem.update({ where: { id: it.lineId }, data: { orderId: primary.id, position: primary.items.length + i } });
      }
      await tx.payment.updateMany({ where: { orderId: secondary.id }, data: { orderId: primary.id } });
      const tables = Array.from(new Set([...(primary.tableNumbers ?? []), ...(secondary.tableNumbers ?? [])]));
      const merged = await loadOrder(tx, primary.id);
      const next = { ...merged, tip: +(primary.tip + secondary.tip).toFixed(2) };
      await touch(tx, primary.id, {
        tableNumbers: tables,
        guestCount: (primary.guestCount ?? 0) + (secondary.guestCount ?? 0) || null,
        tip: next.tip,
        ...kitchenFields(primary, computeOrderStatus(merged.items)),
        paymentStatus: next.payments.length === 0 ? "unpaid" : derivePaymentStatus(next),
        total: totalOf(next),
      });
      await touch(tx, secondary.id, {
        mergedIntoOrderId: primary.id,
        paymentStatus: "void",
        status: "CANCELLED",
        voidReason: `Merged into #${primary.orderNumber}`,
        tip: 0,
        total: 0,
      });
      await writeAudit(tx, {
        type: "manager-override",
        orderId: primary.id,
        orderNumber: primary.orderNumber,
        reason: `Merged order #${secondary.orderNumber} into #${primary.orderNumber}`,
        performedByStaffId: actor.staffId,
        ip: actor.ip,
      });
      return { orders: await reload(tx, [primary.id, secondary.id]) };
    }

    case "menu.toggleStock": {
      const mi = await tx.menuItem.findUnique({ where: { id: op.itemId } });
      if (!mi) throw notFound("Menu item not found");
      // Shared with the website: an 86'd item stops selling online too.
      await tx.menuItem.update({ where: { id: mi.id }, data: { isAvailable: !mi.isAvailable } });
      await writeAudit(tx, {
        type: "menu-change",
        reason: `${mi.name} marked ${mi.isAvailable ? "out of stock (86'd) — POS and website" : "back in stock"}`,
        performedByStaffId: actor.staffId,
        meta: { itemId: mi.id },
        ip: actor.ip,
      });
      return { menuItemIds: [mi.id] };
    }

    case "till.open": {
      await requireManagerAuthority(actor, undefined);
      // serialise concurrent "open till" attempts from different terminals
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"till:" + RESTAURANT_ID}))`;
      const open = await openTill(tx);
      if (open) {
        if (open.id === op.tillId) return { tillChanged: true };
        throw conflict("A till session is already open");
      }
      await tx.tillSession.create({
        data: { id: op.tillId, restaurantId: RESTAURANT_ID, openingFloatPence: toPence(op.openingFloat), openedAt: new Date(), openedByStaffId: actor.staffId },
      });
      await writeAudit(tx, { type: "till-open", amountPence: toPence(op.openingFloat), reason: "Till opened", performedByStaffId: actor.staffId, ip: actor.ip });
      return { tillChanged: true };
    }

    case "till.cash": {
      await requireManagerAuthority(actor, undefined);
      const open = await openTill(tx);
      if (!open) throw conflict("No till session is open");
      await tx.cashMovement.createMany({
        data: [{ id: op.movementId, tillSessionId: open.id, type: op.movementType, amountPence: toPence(op.amount), reason: op.reason, at: new Date(), staffId: actor.staffId }],
        skipDuplicates: true,
      });
      await tx.tillSession.update({ where: { id: open.id }, data: { updatedAt: new Date() } });
      return { tillChanged: true };
    }

    case "till.close": {
      await requireManagerAuthority(actor, undefined);
      const open = await openTill(tx);
      if (!open) return { tillChanged: true };
      const cash = await tx.payment.aggregate({ _sum: { amountPence: true }, where: { method: "cash", takenAt: { gte: open.openedAt } } });
      const moves = await tx.cashMovement.findMany({ where: { tillSessionId: open.id } });
      const movesNet = moves.reduce((s, m) => s + (m.type === "in" ? m.amountPence : -m.amountPence), 0);
      // Matches the till screen: float + all cash taken (cash refunds net off) ± cash movements.
      const expected = open.openingFloatPence + (cash._sum.amountPence ?? 0) + movesNet;
      const counted = toPence(op.countedCash);
      await tx.tillSession.update({
        where: { id: open.id },
        data: { closedAt: new Date(), countedCashPence: counted, expectedCashPence: expected, closedByStaffId: actor.staffId, notes: op.notes ?? null },
      });
      const diff = counted - expected;
      await writeAudit(tx, {
        type: "till-close",
        amountPence: counted,
        reason: Math.abs(diff) < 1 ? "Till closed — balanced" : `Till closed — ${diff > 0 ? "over" : "short"} by £${(Math.abs(diff) / 100).toFixed(2)}`,
        performedByStaffId: actor.staffId,
        meta: { expectedPence: expected, countedPence: counted },
        ip: actor.ip,
      });
      return { tillChanged: true };
    }
  }
}

/** Applies a batch of ops in order. Each op gets its own transaction so one bad op
 * (e.g. an expired promo) doesn't block the rest of the outbox. */
export async function processOps(session: SessionStaff, envelopes: OpEnvelope[], ip: string) {
  const db = getDb();
  const results: OpResult[] = [];
  const staffIds = Array.from(new Set(envelopes.map((e) => e.staffId)));
  const staffRows = await db.staff.findMany({ where: { id: { in: staffIds } } });
  const staffById = new Map(staffRows.map((s) => [s.id, s]));

  for (const env of envelopes) {
    const seen = await db.processedOp.findUnique({ where: { id: env.id } });
    if (seen) {
      results.push({ opId: env.id, ok: seen.ok, error: seen.error ?? undefined, duplicate: true });
      continue;
    }
    const credited = staffById.get(env.staffId);
    const actor: Actor = {
      staffId: credited?.active ? credited.id : session.id,
      staffName: credited?.active ? credited.name : session.name,
      session,
      ip,
    };
    try {
      const out = await db.$transaction(
        async (tx) => {
          const r = await applyOp(tx, actor, env.op);
          await tx.processedOp.create({ data: { id: env.id, type: env.op.type, staffId: actor.staffId, ok: true } });
          return r;
        },
        { timeout: 15_000, maxWait: 10_000 }
      );
      results.push({ opId: env.id, ok: true, ...out });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Server error applying change";
      if (!(err instanceof ApiError)) console.error("[ops] failed", env.op.type, err);
      // Permanent (4xx) failures are recorded so a retry doesn't re-run them;
      // 5xx are left un-recorded so the client retries.
      const permanent = err instanceof ApiError && err.status < 500;
      if (permanent) {
        await db.processedOp
          .create({ data: { id: env.id, type: env.op.type, staffId: actor.staffId, ok: false, error: message } })
          .catch(() => {});
      }
      results.push({ opId: env.id, ok: false, error: message, ...(permanent ? {} : { retry: true }) });
    }
  }
  return results;
}
