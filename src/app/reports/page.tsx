"use client";

import { useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { RequireAuth } from "@/components/RequireAuth";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { useReportData } from "@/lib/useReportData";
import { totalPaid, serviceChargeAmount } from "@/lib/billing";
import {
  Lock,
  RotateCcw,
  Ban,
  Percent,
  ShieldCheck,
  Printer,
} from "lucide-react";
import { isManagerRole } from "@/lib/types";

type Range = "today" | "week" | "month" | "all";

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  all: "All time",
};

function rangeStart(range: Range): number {
  const now = new Date();
  if (range === "all") return 0;
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (range === "week") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday start
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day).getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function dayKey(ts: number) {
  return new Date(ts).toDateString();
}

function dayLabel(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function ReportsScreen() {
  const { staffNameById: staffName } = useStore();
  const { currentStaff } = useAuth();
  const [range, setRange] = useState<Range>("today");

  const since = rangeStart(range);
  // Pulled from the database for the chosen range (falls back to this terminal's
  // cached orders when offline).
  const { orders, auditLog, loading: reportLoading, offline: reportOffline } = useReportData(since);
  const paidOrders = useMemo(
    () => orders.filter((o) => o.paymentStatus === "paid" && o.createdAt >= since),
    [orders, since]
  );

  const grossSales = useMemo(
    () => paidOrders.reduce((s, o) => s + totalPaid(o), 0),
    [paidOrders]
  );

  const avgOrderValue = paidOrders.length > 0 ? grossSales / paidOrders.length : 0;

  const bestSellers = useMemo(() => {
    const totals: Record<string, { qty: number; revenue: number }> = {};
    for (const o of paidOrders) {
      for (const item of o.items) {
        if (!totals[item.name]) totals[item.name] = { qty: 0, revenue: 0 };
        totals[item.name].qty += item.quantity;
        totals[item.name].revenue += item.unitPrice * item.quantity;
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10);
  }, [paidOrders]);

  const staffPerformance = useMemo(() => {
    const totals: Record<string, { orders: number; revenue: number }> = {};
    for (const o of paidOrders) {
      if (!totals[o.staffName]) totals[o.staffName] = { orders: 0, revenue: 0 };
      totals[o.staffName].orders += 1;
      totals[o.staffName].revenue += totalPaid(o);
    }
    return Object.entries(totals).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [paidOrders]);

  const discountsGiven = useMemo(
    () => orders.filter((o) => o.discount && o.createdAt >= since),
    [orders, since]
  );
  const discountTotal = discountsGiven.reduce((s, o) => s + (o.discount?.amount ?? 0), 0);

  // Cash/card sales totals for the selected range — payments are the
  // authoritative record of money actually taken, so these total the
  // individual Payment entries (across all payment statuses, since a
  // partially-paid or since-refunded order still had real cash/card
  // movement) rather than re-deriving from order totals.
  const paymentsInRange = useMemo(() => {
    const list: { orderId: string; method: string; amount: number; takenAt: number }[] = [];
    for (const o of orders) {
      for (const p of o.payments) {
        if (p.amount > 0 && p.takenAt >= since) {
          list.push({ orderId: o.id, method: p.method, amount: p.amount, takenAt: p.takenAt });
        }
      }
    }
    return list;
  }, [orders, since]);

  const cashSalesTotal = useMemo(
    () => paymentsInRange.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0),
    [paymentsInRange]
  );
  const cardPayments = useMemo(
    () => paymentsInRange.filter((p) => p.method === "card"),
    [paymentsInRange]
  );
  const cardSalesTotal = cardPayments.reduce((s, p) => s + p.amount, 0);

  const serviceChargesGiven = useMemo(
    () => orders.filter((o) => o.serviceChargePercent && o.createdAt >= since),
    [orders, since]
  );
  const serviceChargeTotal = serviceChargesGiven.reduce(
    (s, o) => s + serviceChargeAmount(o),
    0
  );
  const avgServiceChargePct =
    serviceChargesGiven.length > 0
      ? serviceChargesGiven.reduce((s, o) => s + (o.serviceChargePercent ?? 0), 0) /
        serviceChargesGiven.length
      : 0;

  // Per-day breakdown for the selected range — cash sales, card sales (with
  // transaction count), discounts given, and service charge, one row per
  // calendar day so a manager can see how each day traded rather than only
  // a single rolled-up figure.
  const dailyBreakdown = useMemo(() => {
    const days: Record<
      string,
      {
        key: string;
        label: string;
        sortKey: number;
        cashTotal: number;
        cardTotal: number;
        cardCount: number;
        discountTotal: number;
        serviceChargeTotal: number;
      }
    > = {};

    function bucket(ts: number) {
      const key = dayKey(ts);
      if (!days[key]) {
        const d = new Date(ts);
        days[key] = {
          key,
          label: dayLabel(ts),
          sortKey: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
          cashTotal: 0,
          cardTotal: 0,
          cardCount: 0,
          discountTotal: 0,
          serviceChargeTotal: 0,
        };
      }
      return days[key];
    }

    for (const p of paymentsInRange) {
      const b = bucket(p.takenAt);
      if (p.method === "cash") b.cashTotal += p.amount;
      else {
        b.cardTotal += p.amount;
        b.cardCount += 1;
      }
    }
    for (const o of discountsGiven) {
      bucket(o.createdAt).discountTotal += o.discount?.amount ?? 0;
    }
    for (const o of serviceChargesGiven) {
      bucket(o.createdAt).serviceChargeTotal += serviceChargeAmount(o);
    }

    return Object.values(days).sort((a, b) => b.sortKey - a.sortKey);
  }, [paymentsInRange, discountsGiven, serviceChargesGiven]);

  const auditInRange = useMemo(
    () =>
      auditLog
        .filter(
          (a) =>
            a.at >= since &&
            ["refund", "void", "staff-discount", "manager-override"].includes(a.type)
        )
        .sort((a, b) => b.at - a.at),
    [auditLog, since]
  );

  function printDailyReport() {
    const win = window.open("", "_blank", "width=420,height=720");
    if (!win) return;

    const summaryRows = `
      <tr><td>Net sales</td><td style="text-align:right">£${grossSales.toFixed(2)}</td></tr>
      <tr><td>Orders</td><td style="text-align:right">${paidOrders.length}</td></tr>
      <tr><td>Avg order value</td><td style="text-align:right">£${avgOrderValue.toFixed(2)}</td></tr>
      <tr><td>Discounts given</td><td style="text-align:right">£${discountTotal.toFixed(2)}</td></tr>
      <tr><td>Cash sales</td><td style="text-align:right">£${cashSalesTotal.toFixed(2)}</td></tr>
      <tr><td>Card sales</td><td style="text-align:right">£${cardSalesTotal.toFixed(2)} (${cardPayments.length} txn${cardPayments.length === 1 ? "" : "s"})</td></tr>
      <tr><td>Service charge</td><td style="text-align:right">£${serviceChargeTotal.toFixed(2)}${serviceChargesGiven.length > 0 ? ` (avg ${avgServiceChargePct.toFixed(1).replace(".0", "")}%)` : ""}</td></tr>
      <tr class="grand"><td>Total transactions</td><td style="text-align:right">${paymentsInRange.length}</td></tr>
    `;

    const dailyRows =
      dailyBreakdown
        .map(
          (d) => `
      <tr>
        <td>${d.label}</td>
        <td style="text-align:right">£${d.cashTotal.toFixed(2)}</td>
        <td style="text-align:right">£${d.cardTotal.toFixed(2)} (${d.cardCount})</td>
        <td style="text-align:right">${d.discountTotal > 0 ? `−£${d.discountTotal.toFixed(2)}` : "—"}</td>
        <td style="text-align:right">${d.serviceChargeTotal > 0 ? `£${d.serviceChargeTotal.toFixed(2)}` : "—"}</td>
      </tr>`
        )
        .join("") || `<tr><td colspan="5" style="color:#999">No sales in this range</td></tr>`;

    const bestSellerRows =
      bestSellers
        .map(
          ([name, { qty, revenue }]) => `
      <tr><td>${name} ×${qty}</td><td style="text-align:right">£${revenue.toFixed(2)}</td></tr>`
        )
        .join("") || `<tr><td style="color:#999">No sales in this range</td></tr>`;

    const staffRows =
      staffPerformance
        .map(
          ([name, { orders: n, revenue }]) => `
      <tr><td>${name} · ${n} order${n === 1 ? "" : "s"}</td><td style="text-align:right">£${revenue.toFixed(2)}</td></tr>`
        )
        .join("") || `<tr><td style="color:#999">No sales in this range</td></tr>`;

    const auditRows =
      auditInRange
        .map(
          (entry) => `
      <tr>
        <td>
          ${entry.type}${entry.orderNumber ? ` · #${entry.orderNumber}` : ""}${
            entry.amount !== undefined ? ` · £${entry.amount.toFixed(2)}` : ""
          }<br/>
          <span style="color:#777">${entry.reason} — by ${staffName(entry.performedByStaffId)}${
            entry.approvedByStaffId ? `, auth. ${staffName(entry.approvedByStaffId)}` : ""
          }</span>
        </td>
      </tr>`
        )
        .join("") ||
      `<tr><td style="color:#999">No voids, refunds or staff discounts in this range</td></tr>`;

    win.document.write(`
      <html>
        <head>
          <title>Daily Report — ${RANGE_LABELS[range]}</title>
          <style>
            body { font-family: ui-monospace, monospace; padding: 20px; width: 340px; }
            h1 { font-size: 16px; margin: 0 0 2px; }
            h2 { font-size: 12px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
            p.meta { font-size: 11px; margin: 0 0 10px; color: #444; }
            table { width: 100%; font-size: 12px; border-collapse: collapse; }
            td { padding: 3px 0; vertical-align: top; }
            .grand { font-weight: bold; border-top: 1px dashed #999; }
            .grand td { padding-top: 6px; }
          </style>
        </head>
        <body>
          <h1>${BRAND.receiptHeading}</h1>
          <p class="meta">Daily report · ${RANGE_LABELS[range]}<br/>Printed ${new Date().toLocaleString()}</p>

          <h2>Summary</h2>
          <table>${summaryRows}</table>

          <h2>Daily breakdown</h2>
          <table>${dailyRows}</table>

          <h2>Best-selling items</h2>
          <table>${bestSellerRows}</table>

          <h2>Staff performance</h2>
          <table>${staffRows}</table>

          <h2>Void &amp; refund audit log</h2>
          <table>${auditRows}</table>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  if (!isManagerRole(currentStaff?.role)) {
    return (
      <div className="h-screen flex flex-col">
        <TopBar />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <Lock size={28} className="text-cardamom/30 mb-3" />
          <p className="font-display text-xl mb-1">Manager access only</p>
          <p className="text-sm text-cardamom/50 max-w-xs">
            Reporting and admin, shared with the website&apos;s admin panel, is restricted to
            managers and admins.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl">Reports</h1>
            <p className="text-xs text-cardamom/45 mt-0.5">
              {reportLoading
                ? "Loading from the database…"
                : reportOffline
                ? "Offline — showing this terminal's cached orders only"
                : "Live from the database"}{" "}
              · <a href="/admin" className="underline underline-offset-2">Open admin panel</a>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1.5">
              {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    range === r
                      ? "bg-onyx text-ivory border-onyx"
                      : "bg-white border-cardamom/15 text-cardamom/70"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
            <button
              onClick={printDailyReport}
              className="flex items-center gap-1.5 text-xs font-semibold border border-cardamom/15 rounded-full px-3 py-1.5 hover:bg-cardamom/5"
            >
              <Printer size={13} /> Print report
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <SummaryCard label="Net sales" value={`£${grossSales.toFixed(2)}`} />
          <SummaryCard label="Orders" value={String(paidOrders.length)} />
          <SummaryCard label="Avg order value" value={`£${avgOrderValue.toFixed(2)}`} />
          <SummaryCard label="Discounts given" value={`£${discountTotal.toFixed(2)}`} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Cash sales" value={`£${cashSalesTotal.toFixed(2)}`} />
          <SummaryCard
            label="Card sales"
            value={`£${cardSalesTotal.toFixed(2)}`}
            sub={`${cardPayments.length} transaction${cardPayments.length === 1 ? "" : "s"}`}
          />
          <SummaryCard
            label="Service charge"
            value={`£${serviceChargeTotal.toFixed(2)}`}
            sub={
              serviceChargesGiven.length > 0
                ? `avg ${avgServiceChargePct.toFixed(1).replace(".0", "")}%`
                : "not applied"
            }
          />
          <SummaryCard
            label="Total transactions"
            value={String(paymentsInRange.length)}
          />
        </div>

        <section className="rounded-xl border border-cardamom/10 bg-white p-4 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-3">
            Daily breakdown
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-cardamom/40">
                  <th className="font-medium pb-2 pr-3">Date</th>
                  <th className="font-medium pb-2 pr-3 text-right">Cash sales</th>
                  <th className="font-medium pb-2 pr-3 text-right">Card sales</th>
                  <th className="font-medium pb-2 pr-3 text-right">Card txns</th>
                  <th className="font-medium pb-2 pr-3 text-right">Discounts</th>
                  <th className="font-medium pb-2 text-right">Service charge</th>
                </tr>
              </thead>
              <tbody>
                {dailyBreakdown.map((d) => (
                  <tr key={d.key} className="border-t border-cardamom/8">
                    <td className="py-1.5 pr-3 text-cardamom/75">{d.label}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      £{d.cashTotal.toFixed(2)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      £{d.cardTotal.toFixed(2)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-cardamom/50">
                      {d.cardCount}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-chili">
                      {d.discountTotal > 0 ? `−£${d.discountTotal.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gold-dark">
                      {d.serviceChargeTotal > 0 ? `£${d.serviceChargeTotal.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dailyBreakdown.length === 0 && (
              <p className="text-sm text-cardamom/35 text-center py-6">No sales in this range</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-cardamom/10 bg-white p-4 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-3">
            Best-selling items
          </h2>
          <div className="space-y-1.5">
            {bestSellers.map(([name, { qty, revenue }]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-cardamom/75">
                  {name} <span className="text-cardamom/35">×{qty}</span>
                </span>
                <span className="tabular-nums font-medium">£{revenue.toFixed(2)}</span>
              </div>
            ))}
            {bestSellers.length === 0 && (
              <p className="text-sm text-cardamom/35">No sales in this range</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-cardamom/10 bg-white p-4 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-3">
            Staff performance
          </h2>
          <div className="space-y-1.5">
            {staffPerformance.map(([name, { orders: n, revenue }]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-cardamom/75">
                  {name} <span className="text-cardamom/35">· {n} order{n === 1 ? "" : "s"}</span>
                </span>
                <span className="tabular-nums font-medium">£{revenue.toFixed(2)}</span>
              </div>
            ))}
            {staffPerformance.length === 0 && (
              <p className="text-sm text-cardamom/35">No sales in this range</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-cardamom/10 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-3 flex items-center gap-1.5">
            <ShieldCheck size={13} /> Void &amp; refund audit log
          </h2>
          <div className="space-y-2">
            {auditInRange.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2.5 text-sm">
                <span
                  className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    entry.type === "refund"
                      ? "bg-chili/10 text-chili"
                      : entry.type === "void"
                      ? "bg-cardamom/10 text-cardamom/50"
                      : "bg-gold/10 text-gold-dark"
                  }`}
                >
                  {entry.type === "refund" ? (
                    <RotateCcw size={13} />
                  ) : entry.type === "void" ? (
                    <Ban size={13} />
                  ) : (
                    <Percent size={13} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-cardamom/80">
                    <span className="font-medium capitalize">{entry.type.replace("-", " ")}</span>
                    {entry.orderNumber ? ` · Order #${entry.orderNumber}` : ""}
                    {entry.amount !== undefined ? ` · £${entry.amount.toFixed(2)}` : ""}
                  </p>
                  <p className="text-xs text-cardamom/45">
                    {entry.reason} — by {staffName(entry.performedByStaffId)}
                    {entry.approvedByStaffId
                      ? `, authorised by ${staffName(entry.approvedByStaffId)}`
                      : ""}{" "}
                    · {new Date(entry.at).toLocaleString([], {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {auditInRange.length === 0 && (
              <p className="text-sm text-cardamom/35">No voids, refunds or staff discounts in this range</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-cardamom/10 bg-white p-3.5">
      <p className="text-[11px] uppercase tracking-wide text-cardamom/45">{label}</p>
      <p className="font-display text-xl mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-cardamom/40 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <ReportsScreen />
    </RequireAuth>
  );
}
