"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { Order } from "@/lib/types";
import { netSubtotal, serviceChargeAmount } from "@/lib/billing";
import { OrderDetail } from "@/components/admin/OrderDetail";
import { Badge, Button, Card, DateRange, ErrorNote, Input, PageHeader, Select, fmtDateTime, gbp, londonDay, paymentTone, td, th, useAdminData } from "@/components/admin/ui";

const PAGE = 50;

export default function OrdersAdmin() {
  const [from, setFrom] = useState(londonDay(-6));
  const [to, setTo] = useState(londonDay(0));
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ from, to, limit: String(PAGE), offset: String(offset) });
  if (status) params.set("paymentStatus", status);
  if (channel) params.set("channel", channel);
  if (type) params.set("orderType", type);
  if (q.trim()) params.set("q", q.trim());
  const { data, error, loading } = useAdminData<{ orders: Order[]; total: number }>(`/api/admin/orders?${params}`);

  const reset = () => setOffset(0);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Every POS and website order. Kept for 6 years for HMRC — nothing is ever deleted."
        actions={
          <a href={`/api/admin/export?type=orders&from=${from}&to=${to}`}>
            <Button>
              <Download size={14} /> Export CSV
            </Button>
          </a>
        }
      />
      <div className="flex flex-col gap-3 mb-4">
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); reset(); }} />
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Order #, table, customer or staff" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} className="!w-64" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className="!w-40">
            <option value="">Any payment status</option>
            <option value="unpaid,partial">Open (unpaid)</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
            <option value="void">Void</option>
          </Select>
          <Select value={channel} onChange={(e) => { setChannel(e.target.value); reset(); }} className="!w-36">
            <option value="">POS + website</option>
            <option value="POS">POS only</option>
            <option value="online">Website only</option>
          </Select>
          <Select value={type} onChange={(e) => { setType(e.target.value); reset(); }} className="!w-36">
            <option value="">All types</option>
            <option value="dine-in">Dine-in</option>
            <option value="takeaway">Takeaway</option>
            <option value="delivery">Delivery</option>
          </Select>
        </div>
      </div>
      <ErrorNote error={error} />
      <Card>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>#</th>
                <th className={th}>Placed</th>
                <th className={th}>Type</th>
                <th className={th}>Items</th>
                <th className={th}>Staff / customer</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.orders ?? []).map((o) => (
                <tr key={o.id} onClick={() => setOpen(o.id)} className="cursor-pointer hover:bg-gold/5">
                  <td className={`${td} font-semibold tabular-nums`}>{o.orderNumber}</td>
                  <td className={`${td} text-xs text-cardamom/60 whitespace-nowrap`}>{fmtDateTime(o.createdAt)}</td>
                  <td className={`${td} text-xs`}>
                    {o.channel === "online" ? "Web · " : ""}
                    {o.orderType}
                    {o.tableNumbers?.length ? ` · T${o.tableNumbers.join("+")}` : ""}
                  </td>
                  <td className={`${td} text-xs text-cardamom/60 max-w-[240px] truncate`}>{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</td>
                  <td className={`${td} text-xs`}>{o.deliveryDetails?.name ?? o.staffName}</td>
                  <td className={`${td} text-right tabular-nums font-semibold`}>{gbp(netSubtotal(o) + serviceChargeAmount(o) + o.tip)}</td>
                  <td className={td}>
                    <Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge>
                  </td>
                </tr>
              ))}
              {data && data.orders.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${td} text-center text-cardamom/40`}>
                    No orders match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-4 text-xs text-cardamom/50">
          <span>{loading ? "Loading…" : data ? `${data.total} orders` : ""}</span>
          <div className="flex gap-2">
            <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Previous
            </Button>
            <Button size="sm" disabled={!data || offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
      {open && <OrderDetail orderId={open} onClose={() => setOpen(null)} />}
    </>
  );
}
