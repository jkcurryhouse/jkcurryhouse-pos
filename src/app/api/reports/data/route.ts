import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { requireStaff } from "@/server/auth";
import { handler, json } from "@/server/http";
import { loadOrders, posVisibleOrders, serializeAudit } from "@/server/serialize";
import { RESTAURANT_ID } from "@/server/ops";

export const dynamic = "force-dynamic";

/** Orders + audit entries for a date range, for the manager Reports screen. */
export const GET = handler(async (req: NextRequest) => {
  await requireStaff("manager");
  const from = new Date(Number(req.nextUrl.searchParams.get("from") ?? 0));
  const toParam = req.nextUrl.searchParams.get("to");
  const to = toParam ? new Date(Number(toParam)) : new Date(Date.now() + 60_000);
  const db = getDb();
  const [orders, audit] = await Promise.all([
    loadOrders(db, { AND: [posVisibleOrders, { createdAt: { gte: from, lt: to } }] }, { limit: 50000 }),
    db.auditLog.findMany({ where: { restaurantId: RESTAURANT_ID, at: { gte: from, lt: to } } }),
  ]);
  return json({ orders, auditLog: audit.map(serializeAudit) });
});
