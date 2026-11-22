"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useAuth, ManagerApproval } from "@/lib/auth";
import { ManagerApprovalModal } from "./ManagerApprovalModal";
import { X, Tag, Percent } from "lucide-react";
import { isManagerRole } from "@/lib/types";

const STAFF_PRESETS = [10, 20, 50, 100];

export function DiscountModal({ subtotal, onClose }: { subtotal: number; onClose: () => void }) {
  const { applyPromoCode, applyStaffDiscount } = useStore();
  const { currentStaff } = useAuth();
  const [tab, setTab] = useState<"promo" | "staff">("promo");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [needsPin, setNeedsPin] = useState(false);

  function submitPromo() {
    const ok = applyPromoCode(code, subtotal, currentStaff!.id);
    if (ok !== true) {
      setCodeError(typeof ok === "string" ? ok : "Code not recognised or expired");
      return;
    }
    onClose();
  }

  function applyWith(approval: ManagerApproval | null) {
    if (pct === null) return;
    applyStaffDiscount(pct, subtotal, reason.trim() || "No reason given", currentStaff!.id, approval);
    onClose();
  }

  function requestStaffDiscount() {
    if (pct === null) return;
    if (isManagerRole(currentStaff?.role)) {
      applyWith(null); // signed-in manager — their own session is the authority
    } else {
      setNeedsPin(true);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button className="absolute inset-0 bg-cardamom/50" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl bg-ivory shadow-ticket p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Discount</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-cardamom/5">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("promo")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold border ${
              tab === "promo"
                ? "bg-onyx text-ivory border-onyx"
                : "bg-white border-cardamom/15 text-cardamom/70"
            }`}
          >
            <Tag size={14} /> Promo code
          </button>
          <button
            onClick={() => setTab("staff")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold border ${
              tab === "staff"
                ? "bg-onyx text-ivory border-onyx"
                : "bg-white border-cardamom/15 text-cardamom/70"
            }`}
          >
            <Percent size={14} /> Staff discount
          </button>
        </div>

        {tab === "promo" ? (
          <div>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCodeError(null);
              }}
              placeholder="e.g. WELCOME10"
              className="w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/60 uppercase"
            />
            {codeError && <p className="text-chili text-xs mt-1.5">{codeError}</p>}
            <button
              onClick={submitPromo}
              disabled={!code.trim()}
              className="w-full mt-3 rounded-xl bg-onyx text-ivory font-semibold py-3 disabled:opacity-30"
            >
              Apply code
            </button>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              {STAFF_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPct(p)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                    pct === p
                      ? "bg-gold text-onyx border-gold"
                      : "bg-white border-cardamom/15 text-cardamom/70"
                  }`}
                >
                  {p === 100 ? "Comp (100%)" : `${p}%`}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (e.g. service recovery, staff meal)"
              className="w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            />
            <button
              onClick={requestStaffDiscount}
              disabled={pct === null}
              className="w-full mt-3 rounded-xl bg-chili text-ivory font-semibold py-3 disabled:opacity-30"
            >
              {isManagerRole(currentStaff?.role) ? "Apply discount" : "Request manager authorisation"}
            </button>
          </div>
        )}
      </div>

      {needsPin && (
        <ManagerApprovalModal
          title="Authorise staff discount"
          onCancel={() => setNeedsPin(false)}
          onConfirm={(approval) => {
            setNeedsPin(false);
            applyWith(approval);
          }}
        />
      )}
    </div>
  );
}
