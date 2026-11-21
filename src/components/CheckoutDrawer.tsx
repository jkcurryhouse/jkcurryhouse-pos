"use client";

import { useMemo, useState } from "react";
import { Order, PaymentMethod } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { rawSubtotal, amountDueForItems, vatPortion } from "@/lib/billing";
import { X, CreditCard, Banknote, CheckCircle2, Printer } from "lucide-react";

const TIP_PRESETS = [0, 0.1, 0.125, 0.15];
// Percentages, not fractions — matches how it's stored on the order and
// shown in reports. 12.5% is the conventional UK discretionary rate for
// larger parties.
const SERVICE_CHARGE_PRESETS = [0, 10, 12.5];
// UK convention: an optional service charge is commonly proposed for
// larger dine-in parties. This only pre-selects the default — staff/the
// customer can always change or remove it below.
const SERVICE_CHARGE_SUGGEST_GUESTS = 6;

interface PendingPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  cashTendered?: number;
  changeGiven?: number;
}

export function CheckoutDrawer({ order, onClose }: { order: Order; onClose: () => void }) {
  const { recordPayment } = useStore();
  const { currentStaff } = useAuth();

  const itemsSubtotal = useMemo(() => rawSubtotal(order), [order]);
  const discountAmount = order.discount?.amount ?? 0;
  const netSubtotalValue = Math.max(0, itemsSubtotal - discountAmount);
  const paidTowardItems = useMemo(
    () => order.payments.reduce((s, p) => s + p.amount, 0),
    [order]
  );
  // Once any payment has been taken, the service charge % is locked to
  // whatever was committed with that payment — changing it mid-split-bill
  // would silently shift what "remaining balance" means.
  const canEditServiceCharge = paidTowardItems === 0;

  const [serviceChargePct, setServiceChargePct] = useState<number | null>(() => {
    if (order.serviceChargePercent !== undefined) return order.serviceChargePercent / 100;
    // UK convention: suggest a discretionary service charge for larger
    // dine-in parties — staff/customer can still change or remove it.
    return order.guestCount && order.guestCount >= SERVICE_CHARGE_SUGGEST_GUESTS ? 0.125 : 0;
  });
  const [customServiceCharge, setCustomServiceCharge] = useState("");
  const serviceChargePctResolved = canEditServiceCharge
    ? serviceChargePct !== null
      ? serviceChargePct
      : (parseFloat(customServiceCharge || "0") || 0) / 100
    : (order.serviceChargePercent ?? 0) / 100;
  const serviceChargeDue = +(netSubtotalValue * serviceChargePctResolved).toFixed(2);

  // What's still owed for the items themselves (and, once committed, the
  // service charge) — accounts for any payment already taken against this
  // order (e.g. an earlier interrupted split-bill).
  const itemsDue = useMemo(() => amountDueForItems(order), [order]);
  // Before any payment, itemsDue === netSubtotalValue (no service charge
  // committed yet), so this session's chosen % is added on top. After a
  // payment, itemsDue already has the locked-in service charge folded in.
  const subtotal = canEditServiceCharge ? +(itemsDue + serviceChargeDue).toFixed(2) : itemsDue;
  const vat = vatPortion(subtotal);

  const [tipPct, setTipPct] = useState<number | null>(0);
  const [customTip, setCustomTip] = useState("");
  const tip = tipPct !== null ? subtotal * tipPct : parseFloat(customTip || "0") || 0;
  const total = subtotal + tip;

  const [pending, setPending] = useState<PendingPayment[]>([]);
  const paid = pending.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, +(total - paid).toFixed(2));

  const [cashInput, setCashInput] = useState("");
  const [cardInput, setCardInput] = useState("");
  const [done, setDone] = useState(false);

  function addCardPayment() {
    const entered = parseFloat(cardInput || "0");
    const amount = entered > 0 ? Math.min(entered, remaining) : remaining;
    if (amount <= 0) return;
    setPending((prev) => [...prev, { id: `p${prev.length}`, method: "card", amount }]);
    setCardInput("");
  }

  function addCashPayment() {
    const tendered = parseFloat(cashInput || "0");
    if (!tendered || tendered <= 0) return;
    const applied = Math.min(tendered, remaining);
    const change = tendered > remaining ? +(tendered - remaining).toFixed(2) : 0;
    setPending((prev) => [
      ...prev,
      { id: `p${prev.length}`, method: "cash", amount: applied, cashTendered: tendered, changeGiven: change },
    ]);
    setCashInput("");
  }

  function complete() {
    recordPayment(
      order.id,
      pending.map((p) => ({
        method: p.method,
        amount: p.amount,
        cashTendered: p.cashTendered,
        changeGiven: p.changeGiven,
      })),
      tip,
      currentStaff?.id ?? "unknown",
      canEditServiceCharge ? serviceChargePctResolved * 100 : undefined
    );
    setDone(true);
    setTimeout(onClose, 1400);
  }

  function printReceipt(kind: "bill" | "receipt") {
    const win = window.open("", "_blank", "width=380,height=640");
    if (!win) return;
    const lines = order.items
      .map(
        (i) =>
          `<tr><td>${i.quantity}× ${i.name}</td><td style="text-align:right">£${(
            i.unitPrice * i.quantity
          ).toFixed(2)}</td></tr>`
      )
      .join("");
    // A "bill" is printed before payment for the guest to review — it has
    // no tip line yet, since that's only decided when they settle up. A
    // "receipt" is printed after payment completes and shows what was
    // actually paid, tip included.
    const totalsRows =
      kind === "bill"
        ? `
            <tr><td>Items subtotal</td><td style="text-align:right">£${itemsSubtotal.toFixed(2)}</td></tr>
            ${
              discountAmount > 0
                ? `<tr><td>${order.discount?.label ?? "Discount"}</td><td style="text-align:right">−£${discountAmount.toFixed(
                    2
                  )}</td></tr>`
                : ""
            }
            ${
              serviceChargeDue > 0
                ? `<tr><td>Service charge (${(serviceChargePctResolved * 100)
                    .toFixed(1)
                    .replace(".0", "")}%)</td><td style="text-align:right">£${serviceChargeDue.toFixed(
                    2
                  )}</td></tr>`
                : ""
            }
            <tr><td>incl. VAT (20%)</td><td style="text-align:right">£${vat.toFixed(2)}</td></tr>
            <tr class="grand"><td>Total due</td><td style="text-align:right">£${subtotal.toFixed(2)}</td></tr>
          `
        : `
            <tr><td>Items subtotal</td><td style="text-align:right">£${itemsSubtotal.toFixed(2)}</td></tr>
            ${
              discountAmount > 0
                ? `<tr><td>${order.discount?.label ?? "Discount"}</td><td style="text-align:right">−£${discountAmount.toFixed(
                    2
                  )}</td></tr>`
                : ""
            }
            ${
              serviceChargeDue > 0
                ? `<tr><td>Service charge (${(serviceChargePctResolved * 100)
                    .toFixed(1)
                    .replace(".0", "")}%)</td><td style="text-align:right">£${serviceChargeDue.toFixed(
                    2
                  )}</td></tr>`
                : ""
            }
            <tr><td>incl. VAT (20%)</td><td style="text-align:right">£${vat.toFixed(2)}</td></tr>
            <tr><td>Tip</td><td style="text-align:right">£${tip.toFixed(2)}</td></tr>
            <tr class="grand"><td>Total paid</td><td style="text-align:right">£${total.toFixed(2)}</td></tr>
          `;
    win.document.write(`
      <html>
        <head>
          <title>${kind === "bill" ? "Bill" : "Receipt"} #${order.orderNumber}</title>
          <style>
            body { font-family: ui-monospace, monospace; padding: 16px; width: 280px; }
            h1 { font-size: 16px; margin: 0 0 4px; }
            p { font-size: 11px; margin: 0 0 8px; color: #444; }
            table { width: 100%; font-size: 12px; border-collapse: collapse; }
            td { padding: 2px 0; }
            .totals td { border-top: 1px dashed #999; padding-top: 6px; }
            .grand { font-weight: bold; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>${BRAND.receiptHeading}</h1>
          <p>${kind === "bill" ? "Bill" : "Order"} #${order.orderNumber} · ${order.orderType.replace("-", " ")}${
      order.tableNumbers && order.tableNumbers.length > 0
        ? ` · Table${order.tableNumbers.length > 1 ? "s" : ""} ${order.tableNumbers.join(", ")}`
        : ""
    }${
      order.guestCount ? ` · ${order.guestCount} guest${order.guestCount === 1 ? "" : "s"}` : ""
    }<br/>${new Date().toLocaleString()}${
      order.deliveryDetails
        ? `<br/>${order.deliveryDetails.name} · ${order.deliveryDetails.phone}${
            order.orderType === "delivery"
              ? `<br/>${order.deliveryDetails.addressLine1}, ${order.deliveryDetails.postcode}`
              : ""
          }`
        : ""
    }</p>
          <table>${lines}</table>
          <table class="totals">${totalsRows}</table>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  const lastChange = pending[pending.length - 1]?.changeGiven;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button className="absolute inset-0 bg-cardamom/50" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl bg-ivory shadow-ticket max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-cardamom/10">
          <div>
            <h2 className="font-display text-xl">Order #{order.orderNumber}</h2>
            <p className="text-xs text-cardamom/50 capitalize">
              {order.orderType.replace("-", " ")}
              {order.tableNumbers && order.tableNumbers.length > 0
                ? ` · Table${order.tableNumbers.length > 1 ? "s" : ""} ${order.tableNumbers.join(", ")}`
                : ""}
              {order.guestCount ? ` · ${order.guestCount} guest${order.guestCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!done && (
              <button
                onClick={() => printReceipt("bill")}
                title="Print bill"
                className="p-2 rounded-full hover:bg-cardamom/5 text-cardamom/60"
              >
                <Printer size={18} />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-full hover:bg-cardamom/5">
              <X size={20} />
            </button>
          </div>
        </div>

        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <CheckCircle2 size={40} className="text-jade" />
            <p className="font-display text-lg">Payment complete</p>
            {lastChange !== undefined && lastChange > 0 && (
              <p className="text-sm text-cardamom/60">Give £{lastChange.toFixed(2)} change</p>
            )}
            <button
              onClick={() => printReceipt("receipt")}
              className="flex items-center gap-1.5 text-sm font-medium border border-cardamom/15 rounded-full px-4 py-2 hover:bg-cardamom/5 mt-2"
            >
              <Printer size={15} /> Print receipt
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
              <div className="space-y-1.5">
                {order.items.map((item) => (
                  <div key={item.lineId} className="flex justify-between text-sm">
                    <span className="text-cardamom/75">
                      {item.quantity}× {item.name}
                    </span>
                    <span className="tabular-nums">£{(item.unitPrice * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-cardamom/10 pt-3 space-y-1">
                <div className="flex justify-between text-sm text-cardamom/60">
                  <span>Items subtotal</span>
                  <span className="tabular-nums">£{itemsSubtotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-chili">
                    <span>{order.discount?.label ?? "Discount"}</span>
                    <span className="tabular-nums">−£{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {serviceChargeDue > 0 && (
                  <div className="flex justify-between text-sm text-gold-dark">
                    <span>
                      Service charge (
                      {(serviceChargePctResolved * 100).toFixed(1).replace(".0", "")}%)
                    </span>
                    <span className="tabular-nums">£{serviceChargeDue.toFixed(2)}</span>
                  </div>
                )}
                {paidTowardItems > 0.01 && (
                  <div className="flex justify-between text-sm text-jade-dark">
                    <span>Already paid</span>
                    <span className="tabular-nums">−£{paidTowardItems.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-cardamom/40">
                  <span>incl. VAT (20%) on balance</span>
                  <span className="tabular-nums">£{vat.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-2 flex items-center justify-between">
                  <span>Service charge</span>
                  {!canEditServiceCharge && (
                    <span className="text-[10px] font-normal normal-case text-cardamom/35">
                      set at first payment
                    </span>
                  )}
                </div>
                {canEditServiceCharge ? (
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_CHARGE_PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setServiceChargePct(p / 100);
                          setCustomServiceCharge("");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                          serviceChargePct === p / 100
                            ? "bg-gold text-onyx border-gold"
                            : "bg-white border-cardamom/15 text-cardamom/70"
                        }`}
                      >
                        {p === 0 ? "None" : `${p}%`}
                      </button>
                    ))}
                    <input
                      value={customServiceCharge}
                      onChange={(e) => {
                        setCustomServiceCharge(e.target.value.replace(/[^0-9.]/g, ""));
                        setServiceChargePct(null);
                      }}
                      placeholder="Custom %"
                      className={`w-24 px-3 py-1.5 rounded-lg text-sm border outline-none ${
                        serviceChargePct === null ? "border-gold" : "border-cardamom/15"
                      } bg-white`}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-cardamom/60">
                    {serviceChargeDue > 0
                      ? `${(serviceChargePctResolved * 100).toFixed(1).replace(".0", "")}% · £${serviceChargeDue.toFixed(2)}`
                      : "None applied"}
                  </p>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-2">
                  Tip
                </div>
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
                <span>Total due</span>
                <span className="tabular-nums">£{total.toFixed(2)}</span>
              </div>

              {pending.length > 0 && (
                <div className="space-y-1.5">
                  {pending.map((p) => (
                    <div key={p.id} className="flex justify-between text-xs text-jade-dark">
                      <span className="capitalize">
                        {p.method} payment{p.changeGiven ? ` (change £${p.changeGiven.toFixed(2)})` : ""}
                      </span>
                      <span className="tabular-nums">£{p.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {remaining > 0 ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-semibold text-chili">
                    <span>Remaining</span>
                    <span className="tabular-nums">£{remaining.toFixed(2)}</span>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <CreditCard
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-cardamom/35"
                      />
                      <input
                        value={cardInput}
                        onChange={(e) => setCardInput(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder={`Card amount (e.g. ${remaining.toFixed(2)})`}
                        className="w-full pl-9 pr-3 py-3 rounded-xl border border-cardamom/15 bg-white text-sm outline-none focus:border-gold/60"
                      />
                    </div>
                    <button
                      onClick={addCardPayment}
                      className="px-4 rounded-xl bg-gold text-onyx font-medium"
                    >
                      Add card
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Banknote
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-cardamom/35"
                      />
                      <input
                        value={cashInput}
                        onChange={(e) => setCashInput(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder={`Cash tendered (e.g. ${Math.ceil(remaining)})`}
                        className="w-full pl-9 pr-3 py-3 rounded-xl border border-cardamom/15 bg-white text-sm outline-none focus:border-gold/60"
                      />
                    </div>
                    <button
                      onClick={addCashPayment}
                      disabled={!cashInput}
                      className="px-4 rounded-xl bg-onyx text-ivory font-medium disabled:opacity-30"
                    >
                      Add cash
                    </button>
                  </div>
                  <p className="text-[11px] text-cardamom/40 text-center">
                    Leave the amount blank to take the full remaining balance — split across card
                    and cash by adding partial amounts, which update the remaining balance
                    automatically.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-jade-dark text-sm font-medium">
                  <CheckCircle2 size={16} /> Fully covered — ready to complete
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-cardamom/10">
              <button
                onClick={complete}
                disabled={remaining > 0 || pending.length === 0}
                className="w-full rounded-xl bg-chili text-ivory font-semibold py-3.5 disabled:opacity-30"
              >
                Complete payment
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
