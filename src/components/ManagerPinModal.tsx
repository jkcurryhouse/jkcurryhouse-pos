"use client";

import { useState } from "react";
import { staffAccounts } from "@/lib/mock-data";
import { X, ShieldCheck } from "lucide-react";

export function ManagerPinModal({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: (managerId: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const manager = staffAccounts.find((s) => s.pin === pin && s.role === "manager");
    if (!manager) {
      setError("That PIN isn't a manager PIN");
      setPin("");
      return;
    }
    onConfirm(manager.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button className="absolute inset-0 bg-cardamom/50" onClick={onCancel} aria-label="Cancel" />
      <div className="relative bg-ivory rounded-2xl shadow-ticket w-full max-w-xs p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-chili" />
            <h3 className="font-display text-lg">{title}</h3>
          </div>
          <button onClick={onCancel} className="p-1 rounded-full hover:bg-cardamom/5">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-cardamom/50 mb-3">Manager PIN required to authorise this.</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          className="w-full text-center tracking-[0.5em] text-lg rounded-lg border border-cardamom/15 bg-white px-3 py-2 outline-none focus:border-chili/60"
          autoFocus
        />
        {error && <p className="text-chili text-xs mt-2 text-center">{error}</p>}
        <button
          onClick={submit}
          disabled={pin.length !== 4}
          className="w-full mt-4 rounded-xl bg-chili text-ivory font-semibold py-2.5 disabled:opacity-30"
        >
          Authorise
        </button>
      </div>
    </div>
  );
}
