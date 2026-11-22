import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { handler, json } from "@/server/http";
import { adminContext, dateRange, page, TZ } from "@/server/admin";
import { RESTAURANT_ID } from "@/server/ops";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const sp = req.nextUrl.searchParams;
  const { from, to } = dateRange(req, 30);
  const { limit, offset } = page(req, 500);
  const [bounds] = await db.$queryRaw<{ start: Date; end: Date }[]>(Prisma.sql`
    select (${from}::date::timestamp at time zone ${TZ}) as start,
           ((${to}::date + 1)::timestamp at time zone ${TZ}) as "end"`);
  const where: Prisma.AuditLogWhereInput = { restaurantId: RESTAURANT_ID, at: { gte: bounds.start, lt: bounds.end } };
  const types = sp.get("types");
  if (types) where.type = { in: types.split(",") };
  const staffId = sp.get("staffId");
  if (staffId) where.OR = [{ performedByStaffId: staffId }, { approvedByStaffId: staffId }];
  const [rows, total, staff] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { at: "desc" }, take: limit, skip: offset }),
    db.auditLog.count({ where }),
    db.staff.findMany({ select: { id: true, name: true } }),
  ]);
  const name = new Map(staff.map((s) => [s.id, s.name]));
  return json({
    total,
    entries: rows.map((a) => ({
      id: a.id,
      type: a.type,
      reason: a.reason,
      orderId: a.orderId,
      orderNumber: a.orderNumber,
      amount: a.amountPence != null ? a.amountPence / 100 : null,
      performedBy: name.get(a.performedByStaffId) ?? (a.performedByStaffId === "online" ? "Website" : a.performedByStaffId),
      approvedBy: a.approvedByStaffId ? name.get(a.approvedByStaffId) ?? a.approvedByStaffId : null,
      ip: a.ip,
      at: a.at.getTime(),
    })),
  });
});
