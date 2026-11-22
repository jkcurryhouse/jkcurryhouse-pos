import "server-only";
import { Prisma } from "@/db";

/**
 * Report queries read the shared website tables through these CTEs, which expose them
 * with POS-style column names and money in integer pence:
 *   orders(id, order_number, created_at, channel, order_type, table_numbers, guest_count,
 *          staff_name, payment_status, discount_pence, tip_pence, delivery_fee_pence,
 *          service_charge_percent, merged_into_order_id, discount, discount_code,
 *          delivery_details, guest_email, void_reason, web_status, restaurant_id)
 *   order_items(order_id, menu_item_id, name, unit_price_pence, quantity, category)
 * Website checkouts that were never paid are excluded. Payment status for older website
 * orders is derived from the website's lifecycle status.
 */
export const REPORT_CTES = Prisma.sql`
orders as (
  select o.id,
    o."orderNumber" as order_number,
    o."createdAt" as created_at,
    o.channel,
    lower(replace(o.type::text, '_', '-')) as order_type,
    o."tableNumbers" as table_numbers,
    o."guestCount" as guest_count,
    coalesce(o."staffName", case when o.channel = 'online' then 'Website' else '—' end) as staff_name,
    case
      when o.channel = 'online' and o."paymentStatus" = 'unpaid' and o.status in ('CONFIRMED','PREPARING','READY','DELIVERED') then 'paid'
      when o.channel = 'online' and o."paymentStatus" = 'unpaid' and o.status = 'CANCELLED' then 'void'
      else o."paymentStatus"
    end as payment_status,
    round(o."discountAmount" * 100)::int as discount_pence,
    round(o.tip * 100)::int as tip_pence,
    round(o."deliveryFee" * 100)::int as delivery_fee_pence,
    o."serviceChargePercent" as service_charge_percent,
    o."mergedIntoOrderId" as merged_into_order_id,
    o.discount,
    o."discountCode" as discount_code,
    o."deliveryDetails" as delivery_details,
    o."guestEmail" as guest_email,
    o."voidReason" as void_reason,
    o.status::text as web_status,
    ${process.env.RESTAURANT_ID ?? "anand-main"}::text as restaurant_id
  from "Order" o
  where not (o.channel = 'online' and o.status = 'PENDING' and o."paymentStatus" = 'unpaid')
),
order_items as (
  select i."orderId" as order_id, i."menuItemId" as menu_item_id, coalesce(i.name, m.name) as name,
    round(i.price * 100)::int as unit_price_pence, i.quantity, m.category::text as category
  from "OrderItem" i join "MenuItem" m on m.id = i."menuItemId"
)`;
