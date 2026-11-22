"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { BarChart, Button, Card, DateRange, ErrorNote, PageHeader, Stat, gbp, londonDay, td, th, useAdminData } from "@/components/admin/ui";

interface Report {
  from: string;
  to: string;
  vatRatePercent: number;
  summary: {
    paidOrders: number;
    grossItems: number;
    discounts: number;
    netSales: number;
    vat: number;
    netExVat: number;
    serviceCharge: number;
    tips: number;
    averageOrder: number;
    covers: number;
    voids: number;
    refunds: number;
    refundedValue: number;
    openOrders: number;
  };
  daily: { day: string; orders: number; net: number; discounts: number; tips: number }[];
  byChannel: { label: string; orders: number; net: number }[];
  byHour: { hour: number; orders: number; net: number }[];
  byItem: { name: string; category: string; qty: number; gross: number }[];
  byCategory: { category: string; qty: number; gross: number }[];
  byStaff: { name: string; orders: number; net: number; tips: number }[];
  takings: { method: string; taken: number; refunded: number; count: number }[];
  promos: { label: string; uses: number; amount: number }[];
}

const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto -mx-5">
      <table className="w-full">
        <thead>
          <tr>{head.map((h, i) => <th key={h} className={`${th} ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={`${td} ${j > 0 ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>
          ))}
          {rows.length === 0 && <tr><td className={`${td} text-cardamom/40`} colSpan={head.length}>No sales in this period.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function SalesReports() {
  const [from, setFrom] = useState(londonDay(-29));
  const [to, setTo] = useState(londonDay(0));
  const { data, error, loading } = useAdminData<Report>(`/api/admin/reports?from=${from}&to=${to}`);
  const s = data?.summary;
  const exportLink = (type: string) => `/api/admin/export?type=${type}&from=${from}&to=${to}`;

  // fill every hour from 11:00 to 23:00 so the shape of service is visible
  const hours = Array.from({ length: 13 }, (_, i) => i + 11).map((h) => {
    const x = data?.byHour.find((b) => b.hour === h);
    return { key: String(h), label: `${h}:00`, value: x?.net ?? 0, sub: `${x?.orders ?? 0} orders` };
  });

  return (
    <>
      <PageHeader
        title="Sales reports"
        subtitle="Paid orders, London time. Prices include VAT; VAT is extracted at the configured rate."
        actions={
          <>
            <a href={exportLink("daily")}><Button><Download size={14} /> Daily summary</Button></a>
            <a href={exportLink("payments")}><Button><Download size={14} /> Transactions</Button></a>
            <Button onClick={() => window.print()}><Printer size={14} /> Print</Button>
          </>
        }
      />
      <div className="mb-5"><DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
      <ErrorNote error={error} />
      {!data || !s ? (
        <p className="text-sm text-cardamom/40">{loading ? "Loading…" : ""}</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Net sales (inc. VAT)" value={gbp(s.netSales)} hint={`${s.paidOrders} paid orders`} />
            <Stat label={`VAT @ ${data.vatRatePercent}%`} value={gbp(s.vat)} hint={`Ex-VAT ${gbp(s.netExVat)}`} />
            <Stat label="Average order" value={gbp(s.averageOrder)} hint={`${s.covers} dine-in covers`} />
            <Stat label="Discounts" value={gbp(s.discounts)} hint={`from ${gbp(s.grossItems)} gross`} />
            <Stat label="Service charge" value={gbp(s.serviceCharge)} />
            <Stat label="Tips" value={gbp(s.tips)} />
            <Stat label="Refunds" value={s.refunds} hint={gbp(s.refundedValue)} />
            <Stat label="Voids / still open" value={`${s.voids} / ${s.openOrders}`} />
          </div>

          <Card title="Net sales by day">
            <BarChart label="Net sales by day" data={data.daily.map((d) => ({ key: d.day, label: day(d.day), value: d.net, sub: `${d.orders} orders` }))} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Takings by payment method">
              <Table
                head={["Method", "Payments", "Taken", "Refunded", "Net"]}
                rows={data.takings.map((t) => [t.method === "card" ? "Card" : "Cash", t.count, gbp(t.taken), gbp(t.refunded), gbp(t.taken - t.refunded)])}
              />
            </Card>
            <Card title="Sales by channel">
              <Table head={["Channel", "Orders", "Net sales"]} rows={data.byChannel.map((c) => [c.label, c.orders, gbp(c.net)])} />
            </Card>
          </div>

          <Card title="Busiest hours">
            <BarChart label="Net sales by hour of day" data={hours} height={120} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Sales by category">
              <Table head={["Category", "Qty", "Gross"]} rows={data.byCategory.map((c) => [c.category, c.qty, gbp(c.gross)])} />
            </Card>
            <Card title="Staff">
              <Table head={["Staff", "Orders", "Net sales", "Tips"]} rows={data.byStaff.map((c) => [c.name, c.orders, gbp(c.net), gbp(c.tips)])} />
            </Card>
          </div>

          <Card title="Items sold">
            <Table head={["Item", "Category", "Qty", "Gross"]} rows={data.byItem.map((c) => [c.name, c.category, c.qty, gbp(c.gross)])} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Promotions & staff discounts">
              <Table head={["Code", "Uses", "Discount given"]} rows={data.promos.map((p) => [p.label, p.uses, gbp(p.amount)])} />
            </Card>
            <Card title="Daily table">
              <Table head={["Day", "Orders", "Net", "Tips"]} rows={data.daily.map((d) => [day(d.day), d.orders, gbp(d.net), gbp(d.tips)])} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
