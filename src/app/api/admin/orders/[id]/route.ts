import { NextRequest } from "next/server";
import { handler, json, notFound } from "@/server/http";
import { adminContext } from "@/server/admin";
import { loadOrders, serializeAudit } from "@/server/serialize";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest, { params }) => {
  const { db } = await adminContext(req);
  const [order] = await loadOrders(db, { id: params.id });
  if (!order) throw notFound();
  const [merged, audit] = await Promise.all([
    db.order.findMany({ where: { mergedIntoOrderId: params.id }, select: { orderNumber: true } }),
    db.auditLog.findMany({ where: { orderId: params.id }, orderBy: { at: "asc" } }),
  ]);
  return json({ order, mergedFrom: merged.map((m) => m.orderNumber), audit: audit.map(serializeAudit) });
});
