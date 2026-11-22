import "server-only";
import { Db, Tx } from "@/db";
import { newId } from "./http";
import { jsonOrNull } from "./serialize";

export const RESTAURANT_ID = process.env.RESTAURANT_ID ?? "anand-main";

export async function writeAudit(
  db: Db | Tx,
  e: {
    type: string;
    reason: string;
    performedByStaffId: string;
    approvedByStaffId?: string;
    orderId?: string;
    orderNumber?: number;
    amountPence?: number;
    meta?: Record<string, unknown>;
    ip?: string;
  }
) {
  await db.auditLog.create({
    data: {
      id: newId("audit"),
      restaurantId: RESTAURANT_ID,
      type: e.type,
      reason: e.reason,
      performedByStaffId: e.performedByStaffId,
      approvedByStaffId: e.approvedByStaffId ?? null,
      orderId: e.orderId ?? null,
      orderNumber: e.orderNumber ?? null,
      amountPence: e.amountPence ?? null,
      meta: jsonOrNull(e.meta),
      ip: e.ip ?? null,
    },
  });
}
