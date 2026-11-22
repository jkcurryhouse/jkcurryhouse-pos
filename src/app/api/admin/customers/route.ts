import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { handler, json } from "@/server/http";
import { adminContext, page } from "@/server/admin";
import { RESTAURANT_ID } from "@/server/ops";
import { serializeCustomer } from "@/server/serialize";
import { normalisePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const { limit, offset } = page(req);
  const qs = req.nextUrl.searchParams.get("q")?.trim();
  const where: Prisma.CustomerWhereInput = { restaurantId: RESTAURANT_ID, anonymisedAt: null };
  if (req.nextUrl.searchParams.get("optIn") === "1") where.marketingOptIn = true;
  if (qs) {
    const digits = normalisePhone(qs);
    where.OR = [
      { name: { contains: qs, mode: "insensitive" } },
      { postcode: { contains: qs, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phoneNormalised: { contains: digits } }] : []),
    ];
  }
  const [rows, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: { lastOrderAt: { sort: "desc", nulls: "last" } }, take: limit, skip: offset }),
    db.customer.count({ where }),
  ]);
  return json({ customers: rows.map(serializeCustomer), total });
});
