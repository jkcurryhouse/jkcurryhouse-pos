"use client";

import { useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { RequireAuth } from "@/components/RequireAuth";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { totalPaid } from "@/lib/billing";
import {
  Lock,
  PlusCircle,
  MinusCircle,
  Download,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TillScreen() {
  const { orders, currentTill, openTill, addCashMovement, closeTill } = useStore();
  const { currentStaff } = useAuth();
  const [floatInput, setFloatInput] = useState("150");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [countedInput, setCountedInput] = useState("");
  const [closedSummary, setClosedSummary] = useState<{
    expected: number;
    counted: number;
    discrepancy: number;
  } | null>(null);

  // Includes partially-paid orders (e.g. a split bill still mid-way through)
  // since real cash/card has already changed hands for those payments, even
  // though the order as a whole isn't fully settled yet. Voided orders never
  // took payment; refunded orders net to ~0 via their negative payment entry.
  const paidOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.paymentStatus === "paid" || o.paymentStatus === "partial" || o.paymentStatus === "refunded") &&
          (!currentTill || o.payments.some((p) => p.takenAt >= currentTill.openedAt))
      ),
    [orders, currentTill]
  );

  const salesByMethod = useMemo(() => {
    const totals: Record<string, number> = { card: 0, cash: 0 };
    for (const o of paidOrders) {
      for (const p of o.payments) {
        if (p.amount > 0) totals[p.method] = (totals[p.method] ?? 0) + p.amount;
      }
    }
    return totals;
  }, [paidOrders]);

  const tipsTotal = useMemo(() => paidOrders.reduce((s, o) => s + o.tip, 0), [paidOrders]);

  const salesByCategory = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const o of paidOrders) {
      for (const item of o.items) {
        // categoryId isn't stored on the line item snapshot, so we look it up
        // via menuItemId — fine for this demo's fixed menu.
        totals[item.name] = (totals[item.name] ?? 0) + item.unitPrice * item.quantity;
      }
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [paidOrders]);

  const salesByStaff = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const o of paidOrders) {
      totals[o.staffName] = (totals[o.staffName] ?? 0) + totalPaid(o);
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [paidOrders]);

  const cashIn = currentTill?.cashMovements.filter((m) => m.type === "in").reduce((s, m) => s + m.amount, 0) ?? 0;
  const cashOut = currentTill?.cashMovements.filter((m) => m.type === "out").reduce((s, m) => s + m.amount, 0) ?? 0;
  const expectedCash = (currentTill?.openingFloat ?? 0) + salesByMethod.cash + cashIn - cashOut;

  function handleExport() {
    const rows: string[][] = [
      ["Order #", "Type", "Channel", "Staff", "Method", "Amount", "Tip", "Status", "Taken at"],
    ];
    for (const o of orders) {
      if (o.payments.length === 0) continue;
      for (const p of o.payments) {
        rows.push([
          String(o.orderNumber),
          o.orderType,
          o.channel,
          o.staffName,
          p.method,
          p.amount.toFixed(2),
          o.tip.toFixed(2),
          o.paymentStatus,
          new Date(p.takenAt).toISOString(),
        ]);
      }
    }
    downloadCsv(`jk-curryhouse-pos-eod-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  if (currentStaff?.role !== "manager") {
    return (
      <div className="h-screen flex flex-col">
        <TopBar />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <Lock size={28} className="text-cardamom/30 mb-3" />
          <p className="font-display text-xl mb-1">Manager access only</p>
          <p className="text-sm text-cardamom/50 max-w-xs">
            Till reconciliation and end-of-day reporting are restricted to managers and admins.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <OfflineBanner />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-2xl mx-auto w-full">
        {!currentTill ? (
          <div className="rounded-2xl border border-cardamom/10 bg-white p-6 text-center">
            <h1 className="font-display text-2xl mb-1">Open the till</h1>
            <p className="text-sm text-cardamom/50 mb-5">
              Count the starting float and open a session before service.
            </p>
            <div className="flex items-center justify-center gap-2 mb-5">
              <span className="text-cardamom/40">£</span>
              <input
                value={floatInput}
                onChange={(e) => setFloatInput(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-28 text-center text-lg font-semibold rounded-lg border border-cardamom/15 px-3 py-2 outline-none focus:border-gold/60"
              />
            </div>
            <button
              onClick={() => openTill(parseFloat(floatInput || "0"), currentStaff!.id)}
              className="rounded-xl bg-onyx text-ivory font-semibold px-6 py-3"
            >
              Open till
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-2xl">Till &amp; end of day</h1>
                <p className="text-xs text-cardamom/45">
                  Opened {new Date(currentTill.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
                  with £{currentTill.openingFloat.toFixed(2)} float
                </p>
              </div>
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 text-xs font-semibold border border-cardamom/15 rounded-full px-3 py-1.5 hover:bg-cardamom/5"
              >
                <Download size={13} /> Export CSV
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Card sales" value={salesByMethod.card ?? 0} />
              <SummaryCard label="Cash sales" value={salesByMethod.cash ?? 0} />
              <SummaryCard label="Tips" value={tipsTotal} />
              <SummaryCard
                label="Total sales"
                value={(salesByMethod.card ?? 0) + (salesByMethod.cash ?? 0) + tipsTotal}
                emphasis
              />
            </div>

            <div className="rounded-xl border border-cardamom/10 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-3">
                By staff member
              </h2>
              <div className="space-y-1.5">
                {salesByStaff.map(([name, amt]) => (
                  <div key={name} className="flex justify-between text-sm">
                    <span className="text-cardamom/75">{name}</span>
                    <span className="tabular-nums font-medium">£{amt.toFixed(2)}</span>
                  </div>
                ))}
                {salesByStaff.length === 0 && (
                  <p className="text-sm text-cardamom/35">No sales recorded yet</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-cardamom/10 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-3">
                Best sellers
              </h2>
              <div className="space-y-1.5">
                {salesByCategory.map(([name, amt]) => (
                  <div key={name} className="flex justify-between text-sm">
                    <span className="text-cardamom/75">{name}</span>
                    <span className="tabular-nums font-medium">£{amt.toFixed(2)}</span>
                  </div>
                ))}
                {salesByCategory.length === 0 && (
                  <p className="text-sm text-cardamom/35">No sales recorded yet</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-cardamom/10 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-3">
                Cash in / out
              </h2>
              <div className="space-y-1.5 mb-3">
                {currentTill.cashMovements.map((m) => (
                  <div key={m.id} className="flex justify-between text-sm">
                    <span className={m.type === "in" ? "text-jade-dark" : "text-chili"}>
                      {m.type === "in" ? "+" : "−"} {m.reason}
                    </span>
                    <span className="tabular-nums font-medium">£{m.amount.toFixed(2)}</span>
                  </div>
                ))}
                {currentTill.cashMovements.length === 0 && (
                  <p className="text-sm text-cardamom/35">No cash movements yet</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Reason (e.g. change top-up)"
                  className="flex-1 min-w-[160px] rounded-lg border border-cardamom/15 px-3 py-2 text-sm outline-none focus:border-gold/60"
                />
                <input
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="£"
                  className="w-20 rounded-lg border border-cardamom/15 px-3 py-2 text-sm outline-none focus:border-gold/60"
                />
                <button
                  onClick={() => {
                    const amt = parseFloat(movementAmount || "0");
                    if (!amt || !movementReason.trim()) return;
                    addCashMovement("in", amt, movementReason.trim(), currentStaff!.id);
                    setMovementAmount("");
                    setMovementReason("");
                  }}
                  className="flex items-center gap-1 text-sm font-medium text-jade-dark border border-jade/30 rounded-lg px-3 py-2 hover:bg-jade/10"
                >
                  <PlusCircle size={15} /> Cash in
                </button>
                <button
                  onClick={() => {
                    const amt = parseFloat(movementAmount || "0");
                    if (!amt || !movementReason.trim()) return;
                    addCashMovement("out", amt, movementReason.trim(), currentStaff!.id);
                    setMovementAmount("");
                    setMovementReason("");
                  }}
                  className="flex items-center gap-1 text-sm font-medium text-chili border border-chili/30 rounded-lg px-3 py-2 hover:bg-chili/10"
                >
                  <MinusCircle size={15} /> Cash out
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-cardamom/10 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-3">
                Close till
              </h2>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-cardamom/60">Expected cash in drawer</span>
                <span className="font-semibold tabular-nums">£{expectedCash.toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-cardamom/40 mb-4">
                Opening float + cash sales + cash in − cash out
              </p>
              {closedSummary ? (
                <div
                  className={`rounded-lg p-3 flex items-start gap-2 text-sm ${
                    Math.abs(closedSummary.discrepancy) < 0.01
                      ? "bg-jade/10 text-jade-dark"
                      : "bg-chili/10 text-chili-dark"
                  }`}
                >
                  {Math.abs(closedSummary.discrepancy) < 0.01 ? (
                    <CheckCircle2 size={18} className="shrink-0" />
                  ) : (
                    <ShieldAlert size={18} className="shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold">
                      Counted £{closedSummary.counted.toFixed(2)} · Expected £
                      {closedSummary.expected.toFixed(2)}
                    </p>
                    <p>
                      {Math.abs(closedSummary.discrepancy) < 0.01
                        ? "Till balances — no discrepancy."
                        : `Discrepancy of £${Math.abs(closedSummary.discrepancy).toFixed(2)} ${
                            closedSummary.discrepancy < 0 ? "short" : "over"
                          }.`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={countedInput}
                    onChange={(e) => setCountedInput(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="Counted cash £"
                    className="flex-1 rounded-lg border border-cardamom/15 px-3 py-2 text-sm outline-none focus:border-gold/60"
                  />
                  <button
                    onClick={() => {
                      const counted = parseFloat(countedInput || "0");
                      closeTill(counted, currentStaff!.id);
                      setClosedSummary({
                        expected: expectedCash,
                        counted,
                        discrepancy: counted - expectedCash,
                      });
                    }}
                    disabled={!countedInput}
                    className="rounded-lg bg-chili text-ivory font-semibold px-4 py-2 text-sm disabled:opacity-30"
                  >
                    Close till
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        emphasis ? "border-gold bg-gold/10" : "border-cardamom/10 bg-white"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-cardamom/45">{label}</p>
      <p className="font-display text-xl mt-0.5 tabular-nums">£{value.toFixed(2)}</p>
    </div>
  );
}

export default function TillPage() {
  return (
    <RequireAuth>
      <TillScreen />
    </RequireAuth>
  );
}
