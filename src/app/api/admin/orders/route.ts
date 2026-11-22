import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { handler, json } from "@/server/http";
import { adminContext, dateRange, page, TZ } from "@/server/admin";
import { loadOrders, ORDER_TYPE_TO_DB } from "@/server/serialize";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const sp = req.nextUrl.searchParams;
  const { from, to } = dateRange(req, 7);
  const { limit, offset } = page(req);

  // London-local date bounds are computed in SQL, then used as a plain timestamp range.
  const [bounds] = await db.$queryRaw<{ start: Date; end: Date }[]>(Prisma.sql`
    select (${from}::date::timestamp at time zone ${TZ}) as start,
           ((${to}::date + 1)::timestamp at time zone ${TZ}) as "end"`);

  const where: Prisma.OrderWhereInput = {
    mergedIntoOrderId: null,
    createdAt: { gte: bounds.start, lt: bounds.end },
  };
  const status = sp.get("paymentStatus");
  if (status === "awaiting-online-payment") where.AND = [{ channel: "online" }, { status: "PENDING" }];
  else if (status) where.paymentStatus = { in: status.split(",") };
  const channel = sp.get("channel");
  if (channel === "POS" || channel === "online") where.channel = channel;
  const type = sp.get("orderType");
  if (type === "dine-in" || type === "takeaway" || type === "delivery") where.type = ORDER_TYPE_TO_DB[type];
  const q = sp.get("q")?.trim();
  if (q) {
    where.OR = /^\d+$/.test(q)
      ? [{ orderNumber: Number(q) }, { tableNumbers: { has: q } }]
      : [
          { staffName: { contains: q, mode: "insensitive" } },
          { guestEmail: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
          { deliveryDetails: { path: ["name"], string_contains: q } },
        ];
  }
  const [orders, total] = await Promise.all([
    loadOrders(db, where, { limit, skip: offset, orderBy: "desc" }),
    db.order.count({ where }),
  ]);
  return json({ orders, total, from, to });
});
