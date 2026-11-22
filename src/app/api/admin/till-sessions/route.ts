import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { handler, json } from "@/server/http";
import { adminContext, page, TZ } from "@/server/admin";
import { RESTAURANT_ID } from "@/server/ops";
import { loadTillSessions } from "@/server/serialize";

export const dynamic = "force-dynamic";

/** Till session history with cash/card takings per session — the end-of-day record. */
export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const { limit, offset } = page(req, 100);
  const ids = (
    await db.tillSession.findMany({
      where: { restaurantId: RESTAURANT_ID },
      orderBy: { openedAt: "desc" },
      take: limit,
      skip: offset,
      select: { id: true },
    })
  ).map((i) => i.id);
  if (ids.length === 0) return json({ sessions: [] });
  const sessions = await loadTillSessions(db, { id: { in: ids } });
  const takings = await db.$queryRaw<{ id: string; cash: number; card: number; orders: number }[]>(Prisma.sql`
    select t.id,
      coalesce(sum(p.amount_pence) filter (where p.method = 'cash'), 0)::int as cash,
      coalesce(sum(p.amount_pence) filter (where p.method = 'card'), 0)::int as card,
      count(distinct p.order_id)::int as orders
    from till_sessions t
    left join payments p on p.taken_at >= t.opened_at and p.taken_at <= coalesce(t.closed_at, now())
    where t.id = any(${ids})
    group by t.id`);
  const byId = new Map(takings.map((t) => [t.id, t]));
  return json({
    timezone: TZ,
    sessions: sessions
      .sort((a, b) => b.openedAt - a.openedAt)
      .map((s) => ({
        ...s,
        cashTaken: (byId.get(s.id)?.cash ?? 0) / 100,
        cardTaken: (byId.get(s.id)?.card ?? 0) / 100,
        orders: byId.get(s.id)?.orders ?? 0,
        discrepancy: s.countedCash != null && s.expectedCash != null ? +(s.countedCash - s.expectedCash).toFixed(2) : null,
      })),
  });
});
