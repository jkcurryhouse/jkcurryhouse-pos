import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { REPORT_CTES } from "@/server/reportSql";
import { categoryName } from "@/lib/categories";
import { handler, json } from "@/server/http";
import { adminContext, dateRange, TZ } from "@/server/admin";
import { RESTAURANT_ID } from "@/server/ops";

export const dynamic = "force-dynamic";
const n = (v: unknown) => Number(v ?? 0);
const gbp = (v: unknown) => n(v) / 100;

/**
 * Sales report for a London-local date range (inclusive).
 * "Net sales" = item prices after discounts, VAT-inclusive, for fully paid orders.
 * VAT is extracted at the restaurant's configured rate (20% standard).
 * "Takings" = money actually moved (payments incl. refunds) by method.
 */
export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const { from, to } = dateRange(req);
  const r = RESTAURANT_ID;
  const q = <T,>(s: Prisma.Sql) => db.$queryRaw<T[]>(s);

  const base = Prisma.sql`
    with ${REPORT_CTES}

    select o.*, (o.created_at at time zone ${TZ}) as local_at,
      (select coalesce(sum(i.unit_price_pence*i.quantity),0) from order_items i where i.order_id = o.id) as items_pence
    from orders o
    where o.restaurant_id = ${r} and o.merged_into_order_id is null
      and (o.created_at at time zone ${TZ})::date between ${from}::date and ${to}::date`;

  const [vatRow] = await q<{ vat_rate_bp: number }>(Prisma.sql`select vat_rate_bp from restaurants where id = ${r}`);
  const vatRate = n(vatRow?.vat_rate_bp ?? 2000) / 10000;

  const [summary] = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}, o as (${base})
    select
      count(*) filter (where payment_status = 'paid') as paid_orders,
      coalesce(sum(items_pence) filter (where payment_status = 'paid'), 0) as gross_items,
      coalesce(sum(discount_pence) filter (where payment_status = 'paid'), 0) as discounts,
      coalesce(sum(items_pence - discount_pence) filter (where payment_status = 'paid'), 0) as net_sales,
      coalesce(sum(round((items_pence - discount_pence) * coalesce(service_charge_percent,0) / 100.0)) filter (where payment_status = 'paid'), 0) as service_charge,
      coalesce(sum(tip_pence) filter (where payment_status = 'paid'), 0) as tips,
      coalesce(sum(delivery_fee_pence) filter (where payment_status = 'paid'), 0) as delivery_fees,
      coalesce(sum(guest_count) filter (where payment_status = 'paid'), 0) as covers,
      count(*) filter (where payment_status = 'void') as voids,
      count(*) filter (where payment_status = 'refunded') as refunds,
      coalesce(sum(items_pence - discount_pence) filter (where payment_status = 'refunded'), 0) as refunded_value,
      count(*) filter (where payment_status in ('unpaid','partial')) as open_orders
    from o`);

  const daily = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}, o as (${base})
    select to_char(local_at::date, 'YYYY-MM-DD') as day,
      count(*) filter (where payment_status = 'paid') as orders,
      coalesce(sum(items_pence - discount_pence) filter (where payment_status = 'paid'), 0) as net,
      coalesce(sum(discount_pence) filter (where payment_status = 'paid'), 0) as discounts,
      coalesce(sum(tip_pence) filter (where payment_status = 'paid'), 0) as tips
    from o group by 1 order by 1`);

  const byChannel = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}, o as (${base})
    select channel || ' · ' || order_type as label, count(*) as orders, coalesce(sum(items_pence - discount_pence), 0) as net
    from o where payment_status = 'paid' group by 1 order by net desc`);

  const byHour = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}, o as (${base})
    select extract(hour from local_at)::int as hour, count(*) as orders, coalesce(sum(items_pence - discount_pence), 0) as net
    from o where payment_status = 'paid' group by 1 order by 1`);

  const byItem = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}, o as (${base})
    select i.name, i.category, sum(i.quantity) as qty, sum(i.quantity * i.unit_price_pence) as gross
    from order_items i join o on o.id = i.order_id
    where o.payment_status = 'paid' group by i.name, i.category order by qty desc limit 100`);

  const byCategory = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}, o as (${base})
    select i.category, sum(i.quantity) as qty, sum(i.quantity * i.unit_price_pence) as gross
    from order_items i join o on o.id = i.order_id
    where o.payment_status = 'paid' group by 1 order by gross desc`);

  const byStaff = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}, o as (${base})
    select staff_name as name, count(*) as orders, coalesce(sum(items_pence - discount_pence), 0) as net, coalesce(sum(tip_pence),0) as tips
    from o where payment_status = 'paid' group by 1 order by net desc`);

  const takings = await q<Record<string, unknown>>(Prisma.sql`
    with ${REPORT_CTES}

    select p.method,
      coalesce(sum(p.amount_pence) filter (where p.amount_pence > 0), 0) as taken,
      coalesce(-sum(p.amount_pence) filter (where p.amount_pence < 0), 0) as refunded,
      count(*) filter (where p.amount_pence > 0) as count
    from payments p join orders o on o.id = p.order_id
    where o.restaurant_id = ${r} and (p.taken_at at time zone ${TZ})::date between ${from}::date and ${to}::date
    group by p.method`);

  const promos = await q<Record<string, unknown>>(Prisma.sql`
    with o as (${base})
    select coalesce(discount->>'code', 'Staff discount') as label, count(*) as uses, sum(discount_pence) as amount
    from o where discount is not null and payment_status = 'paid' group by 1 order by amount desc`);

  const net = n(summary.net_sales);
  const paid = n(summary.paid_orders);
  return json({
    from,
    to,
    vatRatePercent: vatRate * 100,
    summary: {
      paidOrders: paid,
      grossItems: gbp(summary.gross_items),
      discounts: gbp(summary.discounts),
      netSales: net / 100,
      vat: Math.round(net - net / (1 + vatRate)) / 100,
      netExVat: Math.round(net / (1 + vatRate)) / 100,
      serviceCharge: gbp(summary.service_charge),
      tips: gbp(summary.tips),
      deliveryFees: gbp(summary.delivery_fees),
      averageOrder: paid ? net / 100 / paid : 0,
      covers: n(summary.covers),
      voids: n(summary.voids),
      refunds: n(summary.refunds),
      refundedValue: gbp(summary.refunded_value),
      openOrders: n(summary.open_orders),
    },
    daily: daily.map((d) => ({ day: d.day, orders: n(d.orders), net: gbp(d.net), discounts: gbp(d.discounts), tips: gbp(d.tips) })),
    byChannel: byChannel.map((d) => ({ label: d.label, orders: n(d.orders), net: gbp(d.net) })),
    byHour: byHour.map((d) => ({ hour: n(d.hour), orders: n(d.orders), net: gbp(d.net) })),
    byItem: byItem.map((d) => ({ name: d.name, category: categoryName(String(d.category)), qty: n(d.qty), gross: gbp(d.gross) })),
    byCategory: byCategory.map((d) => ({ category: categoryName(String(d.category)), qty: n(d.qty), gross: gbp(d.gross) })),
    byStaff: byStaff.map((d) => ({ name: d.name, orders: n(d.orders), net: gbp(d.net), tips: gbp(d.tips) })),
    takings: takings.map((d) => ({ method: d.method, taken: gbp(d.taken), refunded: gbp(d.refunded), count: n(d.count) })),
    promos: promos.map((d) => ({ label: d.label, uses: n(d.uses), amount: gbp(d.amount) })),
  });
});
