"use client";

import type { Order, AuditLogEntry } from "@/lib/types";
import { netSubtotal, rawSubtotal, serviceChargeAmount, vatPortion } from "@/lib/billing";
import { useStore } from "@/lib/store";
import { Badge, Modal, fmtDateTime, gbp, paymentTone, useAdminData } from "./ui";

export function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { staffNameById } = useStore();
  const { data, error } = useAdminData<{ order: Order; mergedFrom: number[]; audit: AuditLogEntry[] }>(`/api/admin/orders/${orderId}`);
  const o = data?.order;
  return (
    <Modal title={o ? `Order #${o.orderNumber}` : "Order"} onClose={onClose} wide>
      {error && <p className="text-chili text-sm">{error}</p>}
      {!o ? (
        <p className="text-sm text-cardamom/40">Loading…</p>
      ) : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge>
            <Badge>{o.channel === "online" ? "Website" : "POS"}</Badge>
            <Badge>{o.orderType}</Badge>
            {o.tableNumbers?.length ? <Badge>Table {o.tableNumbers.join(" + ")}</Badge> : null}
            {o.guestCount ? <Badge>{o.guestCount} guests</Badge> : null}
            <span className="text-cardamom/50 text-xs ml-auto">
              {fmtDateTime(o.createdAt)} · taken by {o.staffName}
            </span>
          </div>
          {data.mergedFrom.length > 0 && <p className="text-xs text-cardamom/55">Merged from order {data.mergedFrom.map((n) => `#${n}`).join(", ")}</p>}
          {o.voidReason && <p className="text-xs text-chili">Void reason: {o.voidReason}</p>}
          {o.deliveryDetails && (
            <div className="rounded-lg bg-white border border-cardamom/10 px-3 py-2">
              <p className="font-medium">{o.deliveryDetails.name} · {o.deliveryDetails.phone}</p>
              <p className="text-xs text-cardamom/55">
                {[o.deliveryDetails.addressLine1, o.deliveryDetails.street, o.deliveryDetails.town, o.deliveryDetails.postcode].filter(Boolean).join(", ")}
              </p>
            </div>
          )}
          <table className="w-full">
            <tbody>
              {o.items.map((i) => (
                <tr key={i.lineId} className="border-b border-cardamom/5">
                  <td className="py-1.5 pr-2 tabular-nums w-8">{i.quantity}×</td>
                  <td className="py-1.5">
                    {i.name}
                    {(i.spiceLevel || i.modifiers.length > 0 || i.notes) && (
                      <span className="block text-xs text-cardamom/50">
                        {[i.spiceLevel, ...i.modifiers.map((m) => m.optionLabel), i.notes].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{gbp(i.unitPrice * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto max-w-xs space-y-1">
            {[
              ["Items", gbp(rawSubtotal(o))],
              o.discount ? [`Discount (${o.discount.code ?? o.discount.label})`, `−${gbp(o.discount.amount)}`] : null,
              o.serviceChargePercent ? [`Service ${o.serviceChargePercent}%`, gbp(serviceChargeAmount(o))] : null,
              o.tip ? ["Tip", gbp(o.tip)] : null,
              ["Total", gbp(netSubtotal(o) + serviceChargeAmount(o) + o.tip)],
              ["incl. VAT", gbp(vatPortion(netSubtotal(o)))],
            ]
              .filter(Boolean)
              .map((r) => (
                <div key={r![0]} className="flex justify-between">
                  <dt className="text-cardamom/55">{r![0]}</dt>
                  <dd className="tabular-nums font-medium">{r![1]}</dd>
                </div>
              ))}
          </dl>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cardamom/45 mb-1">Payments</p>
            {o.payments.length === 0 ? (
              <p className="text-cardamom/40 text-xs">None</p>
            ) : (
              <ul className="space-y-1">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex justify-between text-xs">
                    <span>
                      {p.amount < 0 ? "Refund" : "Payment"} · {p.method} · {fmtDateTime(p.takenAt)} · {staffNameById(p.takenByStaffId)}
                      {p.cashTendered ? ` · tendered ${gbp(p.cashTendered)}, change ${gbp(p.changeGiven)}` : ""}
                    </span>
                    <span className={`tabular-nums font-semibold ${p.amount < 0 ? "text-chili" : ""}`}>{gbp(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {data.audit.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cardamom/45 mb-1">Audit trail</p>
              <ul className="space-y-1 text-xs">
                {data.audit.map((a) => (
                  <li key={a.id}>
                    {fmtDateTime(a.at)} · <span className="font-medium">{a.type}</span> — {a.reason} · by {staffNameById(a.performedByStaffId)}
                    {a.approvedByStaffId && `, authorised by ${staffNameById(a.approvedByStaffId)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-cardamom/40">Refunds and voids are done from the POS Payments screen so the card reader/cash drawer is involved.</p>
        </div>
      )}
    </Modal>
  );
}
