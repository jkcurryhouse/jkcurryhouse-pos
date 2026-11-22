"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { receiptHeaderHtml, receiptFooterHtml } from "@/lib/receipt";
import { Order } from "@/lib/types";
import { rawSubtotal, vatPortion } from "@/lib/billing";
import {
  X,
  Minus,
  Plus,
  Wand2,
  CreditCard,
  Banknote,
  Loader2,
  CheckCircle2,
  Printer,
  ArrowRight,
} from "lucide-react";

const TIP_PRESETS = [0, 0.1, 0.125, 0.15];
const MAX_SEATS = 6;

export function SplitBillModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { currentStaff } = useAuth();

  const [seatCount, setSeatCount] = useState(2);
  // assignment[lineId] = array of length seatCount, quantity assigned to each seat
  const [assignment, setAssignment] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(order.items.map((i) => [i.lineId, Array(2).fill(0)]))
  );
  const [phase, setPhase] = useState<"assign" | "pay" | "done">("assign");
  const [seatIndex, setSeatIndex] = useState(0);

  function resize(n: number) {
    setSeatCount(n);
    setAssignment((prev) => {
      const next: Record<string, number[]> = {};
      for (const item of order.items) {
        const arr = prev[item.lineId] ?? [];
        const resized = Array(n)
          .fill(0)
          .map((_, i) => arr[i] ?? 0);
        next[item.lineId] = resized;
      }
      return next;
    });
  }

  function splitEvenly() {
    setAssignment(() => {
      const next: Record<string, number[]> = {};
      for (const item of order.items) {
        const base = Math.floor(item.quantity / seatCount);
        const remainder = item.quantity % seatCount;
        const arr = Array(seatCount).fill(base);
        for (let i = 0; i < remainder; i++) arr[i] += 1;
        next[item.lineId] = arr;
      }
      return next;
    });
  }

  function adjust(lineId: string, seat: number, delta: number, max: number) {
    setAssignment((prev) => {
      const arr = [...(prev[lineId] ?? Array(seatCount).fill(0))];
      const assignedTotal = arr.reduce((s, v) => s + v, 0);
      const next = arr[seat] + delta;
      if (next < 0) return prev;
      if (delta > 0 && assignedTotal >= max) return prev;
      arr[seat] = next;
      return { ...prev, [lineId]: arr };
    });
  }

  const fullyAssigned = order.items.every(
    (item) => (assignment[item.lineId] ?? []).reduce((s, v) => s + v, 0) === item.quantity
  );

  const rawTotal = rawSubtotal(order);
  const discountTotal = order.discount?.amount ?? 0;

  const seatSubtotals = useMemo(() => {
    return Array.from({ length: seatCount }, (_, seat) => {
      let raw = 0;
      for (const item of order.items) {
        const qty = assignment[item.lineId]?.[seat] ?? 0;
        raw += qty * item.unitPrice;
      }
      const seatDiscount = rawTotal > 0 ? discountTotal * (raw / rawTotal) : 0;
      return { raw, net: Math.max(0, raw - seatDiscount) };
    });
  }, [assignment, seatCount, order.items, rawTotal, discountTotal]);

  function beginPayment() {
    setSeatIndex(0);
    setPhase("pay");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button className="absolute inset-0 bg-cardamom/50" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl bg-ivory shadow-ticket max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-cardamom/10">
          <h2 className="font-display text-xl">Split order #{order.orderNumber}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-cardamom/5">
            <X size={20} />
          </button>
        </div>

        {phase === "assign" && (
          <>
            <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-cardamom/70">Split into</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => seatCount > 2 && resize(seatCount - 1)}
                    className="w-8 h-8 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center font-semibold tabular-nums">{seatCount}</span>
                  <button
                    onClick={() => seatCount < MAX_SEATS && resize(seatCount + 1)}
                    className="w-8 h-8 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-sm text-cardamom/50">ways</span>
                </div>
              </div>

              <button
                onClick={splitEvenly}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-gold-dark border border-gold/30 rounded-lg py-2 hover:bg-gold/10"
              >
                <Wand2 size={14} /> Split items evenly
              </button>

              <div className="space-y-3">
                {order.items.map((item) => {
                  const arr = assignment[item.lineId] ?? Array(seatCount).fill(0);
                  const assigned = arr.reduce((s, v) => s + v, 0);
                  return (
                    <div key={item.lineId} className="rounded-lg border border-cardamom/10 bg-white p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          {item.name} <span className="text-cardamom/40">×{item.quantity}</span>
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            assigned === item.quantity ? "text-jade-dark" : "text-chili"
                          }`}
                        >
                          {assigned}/{item.quantity} assigned
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {arr.map((count, seat) => (
                          <div
                            key={seat}
                            className="flex items-center gap-1.5 bg-cardamom/5 rounded-lg px-2 py-1"
                          >
                            <span className="text-[10px] font-semibold text-cardamom/40 w-4">
                              S{seat + 1}
                            </span>
                            <button
                              onClick={() => adjust(item.lineId, seat, -1, item.quantity)}
                              className="w-6 h-6 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
                            >
                              <Minus size={11} />
                            </button>
                            <span className="w-4 text-center text-xs font-semibold tabular-nums">
                              {count}
                            </span>
                            <button
                              onClick={() => adjust(item.lineId, seat, 1, item.quantity)}
                              className="w-6 h-6 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.min(seatCount, 3)}, 1fr)` }}
              >
                {seatSubtotals.map((s, i) => (
                  <div key={i} className="rounded-lg bg-gold/10 px-2.5 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-cardamom/40">Seat {i + 1}</p>
                    <p className="font-semibold tabular-nums text-sm">£{s.net.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-cardamom/10">
              <button
                onClick={beginPayment}
                disabled={!fullyAssigned}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-chili text-ivory font-semibold py-3.5 disabled:opacity-30"
              >
                Start taking payments <ArrowRight size={16} />
              </button>
              {!fullyAssigned && (
                <p className="text-xs text-chili text-center mt-2">
                  Assign every item to a seat to continue
                </p>
              )}
            </div>
          </>
        )}

        {phase === "pay" && (
          <SeatPayment
            order={order}
            assignment={assignment}
            seatIndex={seatIndex}
            seatCount={seatCount}
            seatNet={seatSubtotals[seatIndex]?.net ?? 0}
            staffId={currentStaff?.id ?? "unknown"}
            onPaid={() => {
              if (seatIndex + 1 < seatCount) setSeatIndex((i) => i + 1);
              else setPhase("done");
            }}
          />
        )}

        {phase === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <CheckCircle2 size={40} className="text-jade" />
            <p className="font-display text-lg">All {seatCount} seats paid</p>
            <button
              onClick={onClose}
              className="mt-2 rounded-xl bg-onyx text-ivory font-semibold px-6 py-2.5"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SeatPayment({
  order,
  assignment,
  seatIndex,
  seatCount,
  seatNet,
  staffId,
  onPaid,
}: {
  order: Order;
  assignment: Record<string, number[]>;
  seatIndex: number;
  seatCount: number;
  seatNet: number;
  staffId: string;
  onPaid: () => void;
}) {
  const { recordPayment, settings } = useStore();
  const [tipPct, setTipPct] = useState<number | null>(0);
  const [customTip, setCustomTip] = useState("");
  const tip = tipPct !== null ? seatNet * tipPct : parseFloat(customTip || "0") || 0;
  const due = seatNet + tip;

  const [cashInput, setCashInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [changeGiven, setChangeGiven] = useState(0);

  const vat = vatPortion(seatNet);
  const seatItems = order.items
    .map((item) => ({ item, qty: assignment[item.lineId]?.[seatIndex] ?? 0 }))
    .filter((x) => x.qty > 0);

  function payCard() {
    setProcessing(true);
    setTimeout(() => {
      recordPayment(order.id, [{ method: "card", amount: seatNet }], tip, staffId);
      setProcessing(false);
      setPaid(true);
    }, 1200);
  }

  function payCash() {
    const tendered = parseFloat(cashInput || "0");
    if (!tendered || tendered < due) return;
    const change = +(tendered - due).toFixed(2);
    recordPayment(
      order.id,
      [{ method: "cash", amount: seatNet, cashTendered: tendered, changeGiven: change }],
      tip,
      staffId
    );
    setChangeGiven(change);
    setPaid(true);
  }

  function printSeatReceipt() {
    const win = window.open("", "_blank", "width=380,height=640");
    if (!win) return;
    const lines = seatItems
      .map(
        ({ item, qty }) =>
          `<tr><td>${qty}× ${item.name}</td><td style="text-align:right">£${(
            qty * item.unitPrice
          ).toFixed(2)}</td></tr>`
      )
      .join("");
    win.document.write(`
      <html><head><title>Seat ${seatIndex + 1} receipt</title>
      <style>body{font-family:ui-monospace,monospace;padding:16px;width:280px}
      h1{font-size:16px;margin:0 0 4px}p{font-size:11px;color:#444;margin:0 0 8px}
      table{width:100%;font-size:12px;border-collapse:collapse}td{padding:2px 0}
      .totals td{border-top:1px dashed #999;padding-top:6px}.grand{font-weight:bold;font-size:14px}</style>
      </head><body>
      ${receiptHeaderHtml(settings)}
      <p>Order #${order.orderNumber} · Seat ${seatIndex + 1} of ${seatCount}<br/>${new Date().toLocaleString()}</p>
      <table>${lines}</table>
      <table class="totals">
        <tr><td>incl. VAT (20%)</td><td style="text-align:right">£${vat.toFixed(2)}</td></tr>
        <tr><td>Tip</td><td style="text-align:right">£${tip.toFixed(2)}</td></tr>
        <tr class="grand"><td>Total paid</td><td style="text-align:right">£${due.toFixed(2)}</td></tr>
      </table>${receiptFooterHtml(settings)}</body></html>
    `);
    win.document.close();
    win.print();
  }

  if (paid) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 px-5">
        <CheckCircle2 size={36} className="text-jade" />
        <p className="font-display text-lg">Seat {seatIndex + 1} paid</p>
        {changeGiven > 0 && (
          <p className="text-sm text-cardamom/60">Give £{changeGiven.toFixed(2)} change</p>
        )}
        <div className="flex gap-2 mt-1">
          <button
            onClick={printSeatReceipt}
            className="flex items-center gap-1.5 text-sm font-medium border border-cardamom/15 rounded-full px-4 py-2 hover:bg-cardamom/5"
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={onPaid}
            className="flex items-center gap-1.5 text-sm font-semibold bg-onyx text-ivory rounded-full px-4 py-2"
          >
            {seatIndex + 1 < seatCount ? "Next seat" : "Finish"} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-cardamom/50">
        Seat {seatIndex + 1} of {seatCount}
      </p>
      <div className="space-y-1">
        {seatItems.map(({ item, qty }) => (
          <div key={item.lineId} className="flex justify-between text-sm">
            <span className="text-cardamom/75">
              {qty}× {item.name}
            </span>
            <span className="tabular-nums">£{(qty * item.unitPrice).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-cardamom/40 flex justify-between border-t border-cardamom/10 pt-2">
        <span>incl. VAT (20%)</span>
        <span className="tabular-nums">£{vat.toFixed(2)}</span>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-2">Tip</div>
        <div className="flex flex-wrap gap-2">
          {TIP_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setTipPct(p);
                setCustomTip("");
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                tipPct === p
                  ? "bg-onyx text-ivory border-onyx"
                  : "bg-white border-cardamom/15 text-cardamom/70"
              }`}
            >
              {p === 0 ? "No tip" : `${(p * 100).toFixed(1).replace(".0", "")}%`}
            </button>
          ))}
          <input
            value={customTip}
            onChange={(e) => {
              setCustomTip(e.target.value.replace(/[^0-9.]/g, ""));
              setTipPct(null);
            }}
            placeholder="Custom £"
            className={`w-24 px-3 py-1.5 rounded-lg text-sm border outline-none ${
              tipPct === null ? "border-onyx" : "border-cardamom/15"
            } bg-white`}
          />
        </div>
      </div>

      <div className="flex justify-between font-semibold text-base pt-2 border-t border-cardamom/10">
        <span>Due this seat</span>
        <span className="tabular-nums">£{due.toFixed(2)}</span>
      </div>

      <button
        onClick={payCard}
        disabled={processing}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-cardamom/15 bg-white py-3 font-medium hover:border-gold/50 disabled:opacity-70"
      >
        {processing ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Present card to reader…
          </>
        ) : (
          <>
            <CreditCard size={18} /> Card · £{due.toFixed(2)}
          </>
        )}
      </button>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Banknote size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cardamom/35" />
          <input
            value={cashInput}
            onChange={(e) => setCashInput(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={`Cash tendered (min ${due.toFixed(2)})`}
            className="w-full pl-9 pr-3 py-3 rounded-xl border border-cardamom/15 bg-white text-sm outline-none focus:border-gold/60"
          />
        </div>
        <button
          onClick={payCash}
          disabled={!cashInput || parseFloat(cashInput) < due}
          className="px-4 rounded-xl bg-onyx text-ivory font-medium disabled:opacity-30"
        >
          Add cash
        </button>
      </div>
    </div>
  );
}
