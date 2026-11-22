import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { REPORT_CTES } from "@/server/reportSql";
import { handler, badRequest } from "@/server/http";
import { adminContext, dateRange, toCsv, TZ } from "@/server/admin";
import { RESTAURANT_ID } from "@/server/ops";

export const dynamic = "force-dynamic";

const gbp = (p: unknown) => (Number(p ?? 0) / 100).toFixed(2);

/** CSV exports for the accountant (Xero/QuickBooks import) and for GDPR/marketing lists. */
export const GET = handler(async (req: NextRequest) => {
  const { db, audit } = await adminContext(req);
  const type = req.nextUrl.searchParams.get("type");
  const { from, to } = dateRange(req, 30);
  const r = RESTAURANT_ID;
  let rows: (string | number | null)[][] = [];
  const exec = (s: Prisma.Sql) => db.$queryRaw<Record<string, unknown>[]>(s);

  if (type === "orders") {
    const data = await exec(Prisma.sql`
    with ${REPORT_CTES}

      select o.order_number, to_char(o.created_at at time zone ${TZ}, 'YYYY-MM-DD HH24:MI') as at, o.channel, o.order_type,
        array_to_string(o.table_numbers, '+') as tables, o.guest_count, o.staff_name, o.payment_status,
        (select coalesce(sum(i.unit_price_pence*i.quantity),0) from order_items i where i.order_id = o.id) as items,
        o.discount_pence, coalesce(o.discount->>'code', o.discount->>'label') as discount_label,
        o.service_charge_percent, o.tip_pence,
        (select coalesce(sum(p.amount_pence),0) from payments p where p.order_id = o.id) as paid,
        o.delivery_details->>'name' as customer, o.void_reason
      from orders o where o.restaurant_id = ${r} and o.merged_into_order_id is null
        and (o.created_at at time zone ${TZ})::date between ${from}::date and ${to}::date
      order by o.created_at`);
    rows = [["Order #", "Date", "Channel", "Type", "Tables", "Guests", "Staff", "Status", "Items £", "Discount £", "Discount", "Service %", "Tip £", "Net paid £", "Customer", "Void reason"]];
    for (const d of data)
      rows.push([d.order_number as number, d.at as string, d.channel as string, d.order_type as string, d.tables as string, d.guest_count as number, d.staff_name as string, d.payment_status as string, gbp(d.items), gbp(d.discount_pence), d.discount_label as string, d.service_charge_percent as number, gbp(d.tip_pence), gbp(d.paid), d.customer as string, d.void_reason as string]);
  } else if (type === "payments") {
    const data = await exec(Prisma.sql`
    with ${REPORT_CTES}

      select to_char(p.taken_at at time zone ${TZ}, 'YYYY-MM-DD HH24:MI:SS') as at, o.order_number, p.method, p.amount_pence,
        p.cash_tendered_pence, p.change_given_pence, s.name as staff, p.stripe_payment_intent_id, p.id
      from payments p join orders o on o.id = p.order_id left join staff s on s.id = p.taken_by_staff_id
      where o.restaurant_id = ${r} and (p.taken_at at time zone ${TZ})::date between ${from}::date and ${to}::date
      order by p.taken_at`);
    rows = [["Taken at", "Order #", "Method", "Amount £", "Type", "Cash tendered £", "Change £", "Taken by", "Stripe PI", "Payment id"]];
    for (const d of data)
      rows.push([d.at as string, d.order_number as number, d.method as string, gbp(d.amount_pence), Number(d.amount_pence) < 0 ? "refund" : "sale", d.cash_tendered_pence != null ? gbp(d.cash_tendered_pence) : "", d.change_given_pence != null ? gbp(d.change_given_pence) : "", (d.staff as string) ?? "Website", d.stripe_payment_intent_id as string, d.id as string]);
  } else if (type === "daily") {
    const data = await exec(Prisma.sql`
    with ${REPORT_CTES}

      select to_char((o.created_at at time zone ${TZ})::date, 'YYYY-MM-DD') as day, count(*) as orders,
        sum((select sum(i.unit_price_pence*i.quantity) from order_items i where i.order_id = o.id) - o.discount_pence) as net,
        sum(o.discount_pence) as discounts, sum(o.tip_pence) as tips,
        (select vat_rate_bp from restaurants where id = ${r}) as vat_bp
      from orders o where o.restaurant_id = ${r} and o.payment_status = 'paid' and o.merged_into_order_id is null
        and (o.created_at at time zone ${TZ})::date between ${from}::date and ${to}::date
      group by 1 order by 1`);
    rows = [["Date", "Paid orders", "Net sales (inc VAT) £", "VAT £", "Net sales (ex VAT) £", "Discounts £", "Tips £"]];
    for (const d of data) {
      const net = Number(d.net ?? 0);
      const rate = Number(d.vat_bp ?? 2000) / 10000;
      const ex = Math.round(net / (1 + rate));
      rows.push([d.day as string, Number(d.orders), gbp(net), gbp(net - ex), gbp(ex), gbp(d.discounts), gbp(d.tips)]);
    }
  } else if (type === "customers") {
    const optIn = req.nextUrl.searchParams.get("optIn") === "1";
    const data = await exec(Prisma.sql`
      select name, phone, email, postcode, address_line1, street, town, marketing_opt_in, order_count,
        to_char(last_order_at at time zone ${TZ}, 'YYYY-MM-DD') as last_order
      from customers where restaurant_id = ${r} and anonymised_at is null ${optIn ? Prisma.sql`and marketing_opt_in` : Prisma.empty}
      order by last_order_at desc nulls last`);
    rows = [["Name", "Phone", "Email", "Postcode", "Address", "Street", "Town", "Marketing opt-in", "Orders", "Last order"]];
    for (const d of data)
      rows.push([d.name as string, d.phone as string, d.email as string, d.postcode as string, d.address_line1 as string, d.street as string, d.town as string, d.marketing_opt_in ? "yes" : "no", Number(d.order_count), d.last_order as string]);
  } else if (type === "audit") {
    const data = await exec(Prisma.sql`
      select to_char(a.at at time zone ${TZ}, 'YYYY-MM-DD HH24:MI:SS') as at, a.type, a.reason, a.order_number, a.amount_pence,
        s1.name as performed_by, s2.name as approved_by, a.ip
      from audit_log a left join staff s1 on s1.id = a.performed_by_staff_id left join staff s2 on s2.id = a.approved_by_staff_id
      where a.restaurant_id = ${r} and (a.at at time zone ${TZ})::date between ${from}::date and ${to}::date order by a.at`);
    rows = [["At", "Type", "Reason", "Order #", "Amount £", "By", "Authorised by", "IP"]];
    for (const d of data)
      rows.push([d.at as string, d.type as string, d.reason as string, d.order_number as number, d.amount_pence != null ? gbp(d.amount_pence) : "", d.performed_by as string, d.approved_by as string, d.ip as string]);
  } else {
    throw badRequest("type must be one of orders, payments, daily, customers, audit");
  }

  await audit("data-export", `Exported ${type} CSV (${from} to ${to})`);
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jk-curryhouse-${type}-${from}_to_${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
