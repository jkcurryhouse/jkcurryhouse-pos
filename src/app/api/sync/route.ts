import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { requireStaff } from "@/server/auth";
import { handler, json } from "@/server/http";
import {
  loadOrders,
  loadTillSessions,
  posVisibleOrders,
  serializeAudit,
  serializeCustomer,
  serializeMenuItem,
  serializeSettings,
} from "@/server/serialize";
import { RESTAURANT_ID } from "@/server/ops";
import { MENU_CATEGORIES } from "@/lib/categories";
import type { Offer } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const BOOT_ORDER_WINDOW_DAYS = 3;
const BOOT_HISTORY_DAYS = 31;

/**
 * GET /api/sync            -> full bootstrap for a POS/KDS terminal
 * GET /api/sync?since=<ms> -> everything changed since that server time
 *
 * Terminals poll this every few seconds; that's what keeps every POS, the KDS and
 * website orders in step. Clients pass back `serverTime` from the previous response
 * (a small overlap is subtracted to cover in-flight transactions).
 */
export const GET = handler(async (req: NextRequest) => {
  await requireStaff();
  const db = getDb();
  const sinceParam = req.nextUrl.searchParams.get("since");
  const serverTime = Date.now();
  const r = RESTAURANT_ID;

  const settingsRow = await db.restaurant.findUnique({ where: { id: r } });
  const staffDirectory = await db.staff.findMany({
    where: { restaurantId: r },
    select: { id: true, name: true, initials: true, role: true, active: true },
    orderBy: { name: "asc" },
  });

  if (!sinceParam) {
    const windowStart = new Date(serverTime - BOOT_ORDER_WINDOW_DAYS * DAY);
    const historyStart = new Date(serverTime - BOOT_HISTORY_DAYS * DAY);
    const [items, promos, orders, tills, audit, customers] = await Promise.all([
      db.menuItem.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      db.offer.findMany({ where: { active: true, isGeneral: true } }),
      loadOrders(db, {
        AND: [
          posVisibleOrders,
          { OR: [{ createdAt: { gte: windowStart } }, { paymentStatus: { in: ["unpaid", "partial"] } }] },
        ],
      }),
      loadTillSessions(db, { restaurantId: r, OR: [{ openedAt: { gte: historyStart } }, { closedAt: null }] }),
      db.auditLog.findMany({ where: { restaurantId: r, at: { gte: windowStart } } }),
      db.customer.findMany({ where: { restaurantId: r, anonymisedAt: null }, take: 10000 }),
    ]);
    return json({
      mode: "full",
      serverTime,
      settings: settingsRow ? serializeSettings(settingsRow) : null,
      staffDirectory,
      categories: MENU_CATEGORIES,
      menuItems: items.map(serializeMenuItem),
      promoCodes: promos.map(publicPromo),
      orders,
      tillSessions: tills,
      auditLog: audit.map(serializeAudit),
      customers: customers.map(serializeCustomer),
    });
  }

  // 5s overlap covers transactions that committed just after the previous poll read.
  const since = new Date(Math.max(0, Number(sinceParam) - 5000));
  const changed = { gt: since };
  const [items, promos, orders, tillSessions, audit, customers] = await Promise.all([
    db.menuItem.findMany({ where: { updatedAt: changed } }),
    db.offer.findMany({ where: { updatedAt: changed, isGeneral: true } }),
    // merged tombstones are included so terminals can drop them
    loadOrders(db, { updatedAt: changed, NOT: { channel: "online", status: "PENDING", paymentStatus: "unpaid" } }),
    loadTillSessions(db, { restaurantId: r, updatedAt: changed }),
    db.auditLog.findMany({ where: { restaurantId: r, at: changed } }),
    db.customer.findMany({ where: { restaurantId: r, updatedAt: changed } }),
  ]);
  return json({
    mode: "delta",
    serverTime,
    settings: settingsRow && settingsRow.updatedAt > since ? serializeSettings(settingsRow) : null,
    staffDirectory,
    categories: [],
    menuItems: items.map(serializeMenuItem),
    promoCodes: promos.map(publicPromo),
    orders,
    tillSessions,
    auditLog: audit.map(serializeAudit),
    customers: customers.map(serializeCustomer),
  });
});

function publicPromo(p: Offer) {
  const now = new Date();
  const usable =
    p.active &&
    p.isGeneral &&
    p.channels.includes("POS") &&
    (!p.validFrom || p.validFrom <= now) &&
    p.expiresAt >= now &&
    (p.maxUses == null || p.useCount < p.maxUses);
  return { id: p.id, code: p.code, label: p.title, percentOff: p.discount, isPercent: p.isPercent, minSpend: p.minSpend, active: usable };
}
