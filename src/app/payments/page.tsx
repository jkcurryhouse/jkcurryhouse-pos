"use client";

import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { RequireAuth } from "@/components/RequireAuth";
import { CheckoutDrawer } from "@/components/CheckoutDrawer";
import { SplitBillModal } from "@/components/SplitBillModal";
import { MergeOrdersModal } from "@/components/MergeOrdersModal";
import { ManagerApprovalModal } from "@/components/ManagerApprovalModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Order } from "@/lib/types";
import { orderGrandTotal, amountDueForItems } from "@/lib/billing";
import {
  CreditCard,
  RotateCcw,
  Ban,
  Receipt,
  CloudOff,
  Split,
  Merge,
  ChefHat,
} from "lucide-react";
import { isManagerRole } from "@/lib/types";

function PaymentsScreen() {
  const { orders, refundOrder, voidOrder, sendToKitchen } = useStore();
  const { currentStaff } = useAuth();
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
  const [splitOrder, setSplitOrder] = useState<Order | null>(null);
  const [mergeOrder, setMergeOrder] = useState<Order | null>(null);
  const [pinAction, setPinAction] = useState<{ order: Order; kind: "refund" | "void" } | null>(
    null
  );

  const open = orders
    .filter((o) => o.paymentStatus === "unpaid" || o.paymentStatus === "partial")
    .sort((a, b) => a.createdAt - b.createdAt);
  const history = orders
    .filter((o) => o.paymentStatus === "paid" || o.paymentStatus === "refunded" || o.paymentStatus === "void")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);

  function requestManagerAction(order: Order, kind: "refund" | "void") {
    if (isManagerRole(currentStaff?.role)) {
      const what = kind === "refund" ? `Refund order #${order.orderNumber} in full?` : `Void order #${order.orderNumber}? It will be removed from the kitchen and open tickets.`;
      if (!window.confirm(what)) return;
      if (kind === "refund") refundOrder(order.id, currentStaff.id);
      else voidOrder(order.id, currentStaff.id, "Manager void");
    } else {
      setPinAction({ order, kind });
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <OfflineBanner />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <section>
          <h1 className="font-display text-2xl mb-1">Open tickets</h1>
          <p className="text-sm text-cardamom/50 mb-4">
            {open.length} order{open.length === 1 ? "" : "s"} awaiting payment
          </p>

          {open.length === 0 ? (
            <div className="text-center py-12 text-cardamom/35 border border-dashed border-cardamom/15 rounded-xl">
              <Receipt size={26} className="mx-auto mb-2" />
              Nothing waiting on payment
            </div>
          ) : (
            <div className="space-y-2">
              {open.map((order) => {
                const due = amountDueForItems(order);
                const isPartial = order.paymentStatus === "partial";
                return (
                  <div
                    key={order.id}
                    className="rounded-xl border border-cardamom/10 bg-white px-4 py-3.5 hover:border-gold/50 hover:shadow-ticket transition-all"
                  >
                    <button
                      onClick={() => setCheckoutOrder(order)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div>
                        <p className="font-medium">
                          Order #{order.orderNumber}
                          <span className="text-cardamom/40 font-normal capitalize">
                            {" · "}
                            {order.orderType.replace("-", " ")}
                            {order.tableNumbers && order.tableNumbers.length > 0
                              ? ` · Table${order.tableNumbers.length > 1 ? "s" : ""} ${order.tableNumbers.join(", ")}`
                              : ""}
                          </span>
                          {order.syncStatus === "queued" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-chili bg-chili/10 px-1.5 py-0.5 rounded ml-2">
                              <CloudOff size={10} /> Queued
                            </span>
                          )}
                          {isPartial && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gold-dark bg-gold/10 px-1.5 py-0.5 rounded ml-2">
                              Partially paid
                            </span>
                          )}
                          {!order.sentToKitchen && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-cardamom/50 bg-cardamom/10 px-1.5 py-0.5 rounded ml-2">
                              Not sent to kitchen
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-cardamom/45 mt-0.5">
                          {order.items.length} item{order.items.length === 1 ? "" : "s"} · {order.staffName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">
                          {isPartial ? `£${due.toFixed(2)} due` : `£${orderGrandTotal(order).toFixed(2)}`}
                        </span>
                        <CreditCard size={18} className="text-onyx" />
                      </div>
                    </button>
                    <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-cardamom/10 flex-wrap">
                      {!order.sentToKitchen && (
                        <button
                          onClick={() => sendToKitchen(order.id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-onyx-dark border border-onyx/30 rounded-full px-3 py-1.5 hover:bg-onyx/10"
                        >
                          <ChefHat size={13} /> Send to kitchen
                        </button>
                      )}
                      {order.paymentStatus === "unpaid" && (
                        <button
                          onClick={() => setSplitOrder(order)}
                          className="flex items-center gap-1.5 text-xs font-medium text-gold-dark border border-gold/30 rounded-full px-3 py-1.5 hover:bg-gold/10"
                        >
                          <Split size={13} /> Split bill
                        </button>
                      )}
                      <button
                        onClick={() => setMergeOrder(order)}
                        className="flex items-center gap-1.5 text-xs font-medium text-cardamom/60 border border-cardamom/15 rounded-full px-3 py-1.5 hover:bg-cardamom/5"
                      >
                        <Merge size={13} /> Merge into another table
                      </button>
                      {order.paymentStatus === "unpaid" && (
                        <button
                          onClick={() => requestManagerAction(order, "void")}
                          className="flex items-center gap-1.5 text-xs font-medium text-chili border border-chili/25 rounded-full px-3 py-1.5 hover:bg-chili/5 ml-auto"
                        >
                          <Ban size={13} /> Void ticket
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl mb-3">Recent</h2>
          <div className="space-y-2">
            {history.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-xl border border-cardamom/10 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    Order #{order.orderNumber}{" "}
                    <span
                      className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ml-1 ${
                        order.paymentStatus === "paid"
                          ? "bg-jade/15 text-jade-dark"
                          : order.paymentStatus === "refunded"
                          ? "bg-chili/15 text-chili-dark"
                          : "bg-cardamom/10 text-cardamom/50"
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                  </p>
                  <p className="text-xs text-cardamom/45 mt-0.5">
                    {Array.from(new Set(order.payments.map((p) => p.method))).join(" + ") || "—"} · £
                    {orderGrandTotal(order).toFixed(2)} · {order.staffName}
                  </p>
                </div>
                {order.paymentStatus === "paid" && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => requestManagerAction(order, "refund")}
                      title="Refund"
                      className="p-2 rounded-lg hover:bg-chili/10 text-chili"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {history.length === 0 && (
              <p className="text-sm text-cardamom/35 text-center py-6">No payments taken yet</p>
            )}
          </div>
        </section>
      </div>

      {checkoutOrder && (
        <CheckoutDrawer order={checkoutOrder} onClose={() => setCheckoutOrder(null)} />
      )}

      {splitOrder && (
        <SplitBillModal order={splitOrder} onClose={() => setSplitOrder(null)} />
      )}

      {mergeOrder && (
        <MergeOrdersModal order={mergeOrder} onClose={() => setMergeOrder(null)} />
      )}

      {pinAction && (
        <ManagerApprovalModal
          title={pinAction.kind === "refund" ? "Authorise refund" : "Authorise void"}
          onCancel={() => setPinAction(null)}
          onConfirm={(approval) => {
            if (pinAction.kind === "refund") refundOrder(pinAction.order.id, currentStaff!.id, approval);
            else
              voidOrder(
                pinAction.order.id,
                currentStaff!.id,
                `Void authorised by ${approval.managerName}`,
                approval
              );
            setPinAction(null);
          }}
        />
      )}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <RequireAuth>
      <PaymentsScreen />
    </RequireAuth>
  );
}
