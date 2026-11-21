import { Order } from "./types";

export const VAT_RATE = 0.2;

/** Sum of raw item prices before any discount. */
export function rawSubtotal(order: Pick<Order, "items">): number {
  return order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

/** Item subtotal after the order-level discount (tip is never discounted). */
export function netSubtotal(order: Pick<Order, "items" | "discount">): number {
  const discount = order.discount?.amount ?? 0;
  return Math.max(0, rawSubtotal(order) - discount);
}

/**
 * Discretionary service charge amount, calculated on the discounted net
 * subtotal. Unlike tip, this is a house-set percentage rather than a guest
 * choice, so it's computed rather than entered as a flat figure.
 */
export function serviceChargeAmount(
  order: Pick<Order, "items" | "discount" | "serviceChargePercent">
): number {
  const pct = order.serviceChargePercent ?? 0;
  if (!pct) return 0;
  return +(netSubtotal(order) * (pct / 100)).toFixed(2);
}

/** VAT portion of a VAT-inclusive amount at the standard rate. */
export function vatPortion(amount: number): number {
  return amount - amount / (1 + VAT_RATE);
}

/** Amount already paid toward the item total (excludes tip, which is tracked separately). */
export function amountPaidForItems(order: Pick<Order, "payments">): number {
  return order.payments.reduce((s, p) => s + p.amount, 0);
}

/** Outstanding balance still owed for the items and service charge, ignoring tip. */
export function amountDueForItems(
  order: Pick<Order, "items" | "discount" | "payments" | "serviceChargePercent">
): number {
  return Math.max(
    0,
    +(netSubtotal(order) + serviceChargeAmount(order) - amountPaidForItems(order)).toFixed(2)
  );
}

/** Total the guest has actually paid, including tip — what a receipt/report should show. */
export function totalPaid(order: Pick<Order, "payments" | "tip">): number {
  return amountPaidForItems(order) + order.tip;
}

/** Grand total due for a fully-paid order (items net of discount, service charge, plus tip). */
export function orderGrandTotal(
  order: Pick<Order, "items" | "discount" | "tip" | "serviceChargePercent">
): number {
  return netSubtotal(order) + serviceChargeAmount(order) + order.tip;
}
