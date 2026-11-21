"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { OrderType } from "@/lib/types";
import { DiscountModal } from "./DiscountModal";
import { CustomerDetailsModal } from "./CustomerDetailsModal";
import {
  Minus,
  Plus,
  Trash2,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  Tag,
  User,
  Users,
  Clock,
  X,
} from "lucide-react";

const ORDER_TYPES: { id: OrderType; label: string; icon: typeof UtensilsCrossed }[] = [
  { id: "dine-in", label: "Dine-in", icon: UtensilsCrossed },
  { id: "takeaway", label: "Takeaway", icon: ShoppingBag },
  { id: "delivery", label: "Delivery", icon: Bike },
];

const VAT_RATE = 0.2;
const SCHEDULE_PRESETS_MIN = [15, 30, 45, 60];

function formatReadyTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CartPanel() {
  const {
    draftLines,
    orderType,
    tableNumbers,
    guestCount,
    draftDiscount,
    draftCustomer,
    setOrderType,
    addTableNumber,
    removeTableNumber,
    setGuestCount,
    setDraftCustomer,
    draftScheduledFor,
    setDraftScheduledFor,
    removeDraftLine,
    updateDraftQuantity,
    submitOrder,
    clearDraftDiscount,
  } = useStore();
  const { currentStaff } = useAuth();
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [lastSentWasScheduled, setLastSentWasScheduled] = useState<number | null>(null);
  const [tableInput, setTableInput] = useState("");

  function commitTableInput() {
    if (!tableInput.trim()) return;
    addTableNumber(tableInput);
    setTableInput("");
  }

  const subtotal = useMemo(
    () =>
      draftLines.reduce((sum, l) => {
        const modTotal = l.modifiers.reduce((s, m) => s + m.priceDelta, 0);
        return sum + (l.menuItem.price + modTotal) * l.quantity;
      }, 0),
    [draftLines]
  );
  const discountAmount = draftDiscount?.amount ?? 0;
  const netTotal = Math.max(0, subtotal - discountAmount);
  const vat = netTotal - netTotal / (1 + VAT_RATE);
  const canSubmit =
    draftLines.length > 0 &&
    (orderType !== "dine-in" || tableNumbers.length > 0) &&
    (orderType !== "delivery" || draftCustomer !== null);

  function handleSubmit() {
    setLastSentWasScheduled(draftScheduledFor);
    submitOrder(currentStaff?.name ?? "Unknown staff", currentStaff?.id ?? "unknown");
    setJustSubmitted(true);
    setCustomTime("");
    setTimeout(() => setJustSubmitted(false), 1800);
  }

  function applyPresetMinutes(minutes: number) {
    setDraftScheduledFor(Date.now() + minutes * 60000);
    setCustomTime("");
  }

  function applyCustomTime(value: string) {
    setCustomTime(value);
    if (!value) {
      setDraftScheduledFor(null);
      return;
    }
    const [h, m] = value.split(":").map(Number);
    const target = new Date();
    target.setSeconds(0, 0);
    target.setHours(h, m);
    // A time earlier than now means they mean tomorrow (e.g. setting up at
    // 11pm for an 8am collection).
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
    setDraftScheduledFor(target.getTime());
  }

  return (
    <div className="flex flex-col h-full bg-ticket border-l border-cardamom/10">
      <div className="px-4 pt-4 pb-3 border-b border-cardamom/10">
        <div className="grid grid-cols-3 gap-2">
          {ORDER_TYPES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setOrderType(id)}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 border text-xs font-semibold transition-colors ${
                orderType === id
                  ? "bg-onyx text-ivory border-onyx"
                  : "bg-white border-cardamom/15 text-cardamom/70"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        {orderType === "dine-in" && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={tableInput}
                onChange={(e) => setTableInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTableInput();
                  }
                }}
                placeholder={
                  tableNumbers.length > 0 ? "Add another table" : "Table number"
                }
                className="flex-1 min-w-0 rounded-lg border border-cardamom/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold/60"
              />
              <button
                onClick={commitTableInput}
                disabled={!tableInput.trim()}
                className="shrink-0 px-3 rounded-lg border border-cardamom/15 bg-white text-sm font-semibold text-cardamom/70 disabled:opacity-30"
              >
                Add
              </button>
              <div className="shrink-0 flex items-center gap-2 rounded-lg border border-cardamom/15 bg-white px-2.5 py-1.5">
                <Users size={14} className="text-cardamom/40" />
                <button
                  onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                  className="w-6 h-6 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
                  aria-label="Fewer guests"
                >
                  <Minus size={11} />
                </button>
                <span className="w-4 text-center text-sm font-semibold tabular-nums">
                  {guestCount}
                </span>
                <button
                  onClick={() => setGuestCount(guestCount + 1)}
                  className="w-6 h-6 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
                  aria-label="More guests"
                >
                  <Plus size={11} />
                </button>
              </div>
            </div>
            {tableNumbers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tableNumbers.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-full bg-gold/15 text-gold-dark text-xs font-semibold pl-2.5 pr-1.5 py-1"
                  >
                    Table {t}
                    <button
                      onClick={() => removeTableNumber(t)}
                      className="hover:text-chili p-0.5"
                      aria-label={`Remove table ${t}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {tableNumbers.length > 1 && (
                  <span className="flex items-center text-xs text-cardamom/40 pl-1">
                    combined onto one bill
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {(orderType === "delivery" || orderType === "takeaway") && (
          <div className="mt-3">
            {draftCustomer ? (
              <div className="flex items-start justify-between gap-2 rounded-lg bg-white border border-cardamom/15 px-3 py-2">
                <button
                  onClick={() => setCustomerOpen(true)}
                  className="min-w-0 text-left flex items-start gap-2"
                >
                  <User size={14} className="mt-0.5 text-cardamom/50 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {draftCustomer.name} · {draftCustomer.phone}
                    </span>
                    {orderType === "delivery" && (
                      <span className="block text-xs text-cardamom/50 truncate">
                        {draftCustomer.addressLine1}, {draftCustomer.postcode}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  onClick={() => setDraftCustomer(null)}
                  className="text-cardamom/30 hover:text-chili shrink-0 p-1"
                  aria-label="Remove customer details"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCustomerOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-gold-dark border border-gold/30 rounded-lg py-2 hover:bg-gold/10"
              >
                <User size={14} />
                {orderType === "delivery" ? "Add customer & delivery address" : "Add customer details"}
              </button>
            )}
          </div>
        )}

        <div className="mt-3">
          {draftScheduledFor ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-gold/10 border border-gold/30 px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gold-dark">
                <Clock size={14} />
                Ready at {formatReadyTime(draftScheduledFor)}
              </span>
              <button
                onClick={() => {
                  setDraftScheduledFor(null);
                  setCustomTime("");
                }}
                className="text-gold-dark/60 hover:text-chili shrink-0"
                aria-label="Send now instead"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs text-cardamom/40 mr-0.5">
                <Clock size={12} /> Ready:
              </span>
              {SCHEDULE_PRESETS_MIN.map((mins) => (
                <button
                  key={mins}
                  onClick={() => applyPresetMinutes(mins)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-cardamom/15 bg-white text-cardamom/70 hover:border-gold/50"
                >
                  +{mins}m
                </button>
              ))}
              <input
                type="time"
                value={customTime}
                onChange={(e) => applyCustomTime(e.target.value)}
                className="px-2 py-1 rounded-full text-xs border border-cardamom/15 bg-white text-cardamom/70 outline-none focus:border-gold/60"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {draftLines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-cardamom/40 gap-2 py-10">
            <ShoppingBag size={28} />
            <p className="text-sm">Tap a menu item to start the order</p>
          </div>
        ) : (
          draftLines.map((line) => {
            const modTotal = line.modifiers.reduce((s, m) => s + m.priceDelta, 0);
            const lineTotal = (line.menuItem.price + modTotal) * line.quantity;
            return (
              <div
                key={line.lineId}
                className="bg-white rounded-lg border border-cardamom/10 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm leading-tight">{line.menuItem.name}</p>
                    {line.spiceLevel && (
                      <p className="text-[11px] text-cardamom/50 mt-0.5 capitalize">
                        {line.spiceLevel.replace("-", " ")}
                      </p>
                    )}
                    {line.modifiers.map((m) => (
                      <p key={m.optionId} className="text-[11px] text-cardamom/50">
                        {m.optionLabel}
                        {m.priceDelta > 0 ? ` (+£${m.priceDelta.toFixed(2)})` : ""}
                      </p>
                    ))}
                    {line.notes && (
                      <p className="text-[11px] text-gold-dark mt-0.5 italic">
                        “{line.notes}”
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeDraftLine(line.lineId)}
                    className="text-cardamom/30 hover:text-chili shrink-0 p-1"
                    aria-label="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateDraftQuantity(line.lineId, line.quantity - 1)}
                      className="w-7 h-7 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => updateDraftQuantity(line.lineId, line.quantity + 1)}
                      className="w-7 h-7 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    £{lineTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-4 border-t border-cardamom/10 space-y-1.5">
        {draftLines.length > 0 && (
          <div className="pb-1">
            {draftDiscount ? (
              <div className="flex items-center justify-between rounded-lg bg-gold/15 px-3 py-2 text-sm">
                <span className="text-gold-dark font-medium truncate pr-2">
                  {draftDiscount.label}
                </span>
                <button
                  onClick={clearDraftDiscount}
                  className="text-gold-dark/60 hover:text-chili shrink-0"
                  aria-label="Remove discount"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDiscountOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-gold-dark border border-gold/30 rounded-lg py-2 hover:bg-gold/10"
              >
                <Tag size={14} /> Add discount
              </button>
            )}
          </div>
        )}

        <div className="flex justify-between text-sm text-cardamom/60">
          <span>Subtotal</span>
          <span className="tabular-nums">£{subtotal.toFixed(2)}</span>
        </div>
        {draftDiscount && (
          <div className="flex justify-between text-sm text-chili">
            <span>Discount</span>
            <span className="tabular-nums">−£{discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs text-cardamom/40">
          <span>incl. VAT (20%)</span>
          <span className="tabular-nums">£{vat.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold pt-1">
          <span>
            Total
            {orderType === "dine-in" && (guestCount > 1 || tableNumbers.length > 1) && (
              <span className="ml-1.5 font-normal text-xs text-cardamom/40">
                · one bill
                {tableNumbers.length > 1 ? ` · tables ${tableNumbers.join(", ")}` : ""}
                {guestCount > 1 ? ` · ${guestCount} guests` : ""}
              </span>
            )}
          </span>
          <span className="tabular-nums">£{netTotal.toFixed(2)}</span>
        </div>
        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full mt-2 rounded-xl bg-chili text-ivory font-semibold py-3.5 text-base disabled:opacity-30 disabled:pointer-events-none active:bg-chili-dark transition-colors"
        >
          {justSubmitted
            ? lastSentWasScheduled
              ? "Scheduled ✓"
              : "Sent to kitchen ✓"
            : draftScheduledFor
            ? `Send for ${formatReadyTime(draftScheduledFor)}`
            : "Send to kitchen"}
        </button>
        {orderType === "dine-in" && tableNumbers.length === 0 && draftLines.length > 0 && (
          <p className="text-xs text-chili text-center pt-1">Add a table number to send</p>
        )}
        {orderType === "delivery" && !draftCustomer && draftLines.length > 0 && (
          <p className="text-xs text-chili text-center pt-1">
            Add customer details and delivery address to send
          </p>
        )}
      </div>

      {discountOpen && (
        <DiscountModal subtotal={subtotal} onClose={() => setDiscountOpen(false)} />
      )}
      {customerOpen && (
        <CustomerDetailsModal
          onClose={() => setCustomerOpen(false)}
          onSave={(details) => {
            setDraftCustomer(details);
            setCustomerOpen(false);
          }}
        />
      )}
    </div>
  );
}
