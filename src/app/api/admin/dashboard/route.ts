import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { REPORT_CTES } from "@/server/reportSql";
import { handler, json } from "@/server/http";
import { adminContext, TZ } from "@/server/admin";
import { RESTAURANT_ID } from "@/server/ops";

export const dynamic = "force-dynamic";

const n = (v: unknown) => Number(v ?? 0);

export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const r = RESTAURANT_ID;
  const q = <T,>(s: Prisma.Sql) => db.$queryRaw<T[]>(s);

  const [today] = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}, o as (
      select o.*, (select coalesce(sum(i.unit_price_pence * i.quantity),0) from order_items i where i.order_id = o.id) as items_pence
      from orders o
      where o.restaurant_id = ${r} and o.merged_into_order_id is null
        and (o.created_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date
    )
    select
      count(*) filter (where payment_status = 'paid') as paid_orders,
      count(*) as all_orders,
      coalesce(sum(items_pence - discount_pence) filter (where payment_status = 'paid'), 0) as net_sales,
      coalesce(sum(tip_pence) filter (where payment_status = 'paid'), 0) as tips,
      coalesce(sum(discount_pence) filter (where payment_status not in ('void')), 0) as discounts,
      coalesce(sum(guest_count) filter (where payment_status = 'paid'), 0) as covers,
      count(*) filter (where payment_status = 'void') as voids,
      count(*) filter (where payment_status = 'refunded') as refunds,
      count(*) filter (where channel = 'online') as online_orders
    from o`);

  const [open] = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}

    select count(*) as count,
      coalesce(sum((select sum(i.unit_price_pence*i.quantity) from order_items i where i.order_id = o.id) - o.discount_pence), 0) as value
    from orders o where o.restaurant_id = ${r} and o.merged_into_order_id is null and o.payment_status in ('unpaid','partial')`);

  const takings = await q<{ method: string; pence: unknown }>(Prisma.sql`
    with ${REPORT_CTES}

    select p.method, sum(p.amount_pence) as pence from payments p join orders o on o.id = p.order_id
    where o.restaurant_id = ${r} and (p.taken_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date
    group by p.method`);

  const series = await q<{ day: string; net: unknown; orders: unknown }>(Prisma.sql`
    with ${REPORT_CTES}, days as (
      select generate_series((now() at time zone ${TZ})::date - 13, (now() at time zone ${TZ})::date, interval '1 day')::date as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
      coalesce(sum(x.items_pence - x.discount_pence), 0) as net,
      count(x.id) as orders
    from days d left join (
      select o.id, o.discount_pence, (o.created_at at time zone ${TZ})::date as day,
        (select coalesce(sum(i.unit_price_pence*i.quantity),0) from order_items i where i.order_id = o.id) as items_pence
      from orders o where o.restaurant_id = ${r} and o.payment_status = 'paid' and o.merged_into_order_id is null
        and o.created_at > now() - interval '15 days'
    ) x on x.day = d.day
    group by d.day order by d.day`);

  const topItems = await q<{ name: string; qty: unknown; pence: unknown }>(Prisma.sql`
    with ${REPORT_CTES}

    select i.name, sum(i.quantity) as qty, sum(i.quantity * i.unit_price_pence) as pence
    from order_items i join orders o on o.id = i.order_id
    where o.restaurant_id = ${r} and o.payment_status = 'paid'
      and (o.created_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date
    group by i.name order by qty desc limit 5`);

  const outOfStock = await q<{ id: string; name: string }>(Prisma.sql`
    select id, name from "MenuItem" where active and not "isAvailable" order by name`);

  const [till] = await q<Record<string, unknown>>(Prisma.sql`
    select id, opened_at, opening_float_pence, opened_by_staff_id from till_sessions
    where restaurant_id = ${r} and closed_at is null limit 1`);

  const recentAudit = await q<Record<string, unknown>>(Prisma.sql`
    select a.type, a.reason, a.at, a.amount_pence, s.name as staff_name from audit_log a
    left join staff s on s.id = a.performed_by_staff_id
    where a.restaurant_id = ${r} and a.type not in ('login')
    order by a.at desc limit 8`);

  const paid = n(today.paid_orders);
  return json({
    today: {
      netSales: n(today.net_sales) / 100,
      paidOrders: paid,
      allOrders: n(today.all_orders),
      averageOrder: paid ? n(today.net_sales) / 100 / paid : 0,
      tips: n(today.tips) / 100,
      discounts: n(today.discounts) / 100,
      covers: n(today.covers),
      voids: n(today.voids),
      refunds: n(today.refunds),
      onlineOrders: n(today.online_orders),
      takings: Object.fromEntries(takings.map((t) => [t.method, n(t.pence) / 100])),
    },
    openTickets: { count: n(open.count), value: n(open.value) / 100 },
    series: series.map((s) => ({ day: s.day, net: n(s.net) / 100, orders: n(s.orders) })),
    topItems: topItems.map((t) => ({ name: t.name, qty: n(t.qty), revenue: n(t.pence) / 100 })),
    outOfStock,
    till: till
      ? { id: till.id, openedAt: new Date(till.opened_at as string).getTime(), openingFloat: n(till.opening_float_pence) / 100 }
      : null,
    recentAudit: recentAudit.map((a) => ({
      type: a.type,
      reason: a.reason,
      at: new Date(a.at as string).getTime(),
      amount: a.amount_pence != null ? n(a.amount_pence) / 100 : null,
      staffName: a.staff_name,
    })),
  });
});
