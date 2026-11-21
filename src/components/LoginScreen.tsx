"use client";

import { useState } from "react";
import { staffAccounts } from "@/lib/mock-data";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";
import { StaffAccount } from "@/lib/types";
import { Delete, ShieldAlert, WifiOff } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function LoginScreen() {
  const { loginWithPin, loginError } = useAuth();
  const [selected, setSelected] = useState<StaffAccount | null>(null);
  const [pin, setPin] = useState("");
  const [simulateBlocked, setSimulateBlocked] = useState(false);
  const [shake, setShake] = useState(false);

  function handleKey(key: string) {
    if (key === "" ) return;
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      const ok = loginWithPin(next);
      if (!ok) {
        setShake(true);
        setTimeout(() => {
          setShake(false);
          setPin("");
        }, 400);
      }
    }
  }

  if (simulateBlocked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal text-ivory px-6 text-center">
        <ShieldAlert size={40} className="text-chili-light mb-4" />
        <h1 className="font-display text-2xl mb-2">Access blocked</h1>
        <p className="text-white/60 max-w-sm text-sm">
          This device isn&apos;t on JK Curryhouse&apos;s approved restaurant network. Connect to the
          staff Wi-Fi and reload, or ask a manager to check the network allowlist.
        </p>
        <button
          onClick={() => setSimulateBlocked(false)}
          className="mt-6 text-xs text-white/40 underline underline-offset-4"
        >
          (demo) return to network
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-6 py-10">
      <div className="mb-5">
        <BrandMark tone="light" size="lg" showTagline />
      </div>
      <p className="text-cardamom/50 text-sm mb-8">Sign in to start your shift</p>

      {!selected ? (
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {staffAccounts.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="flex flex-col items-center gap-2 rounded-xl border border-cardamom/10 bg-white p-4 hover:border-gold/50 hover:shadow-ticket transition-all"
            >
              <span className="w-12 h-12 rounded-full bg-gold/15 text-gold-dark flex items-center justify-center font-semibold">
                {s.initials}
              </span>
              <span className="text-sm font-medium">{s.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-cardamom/40">
                {s.role}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="w-full max-w-xs flex flex-col items-center">
          <span className="w-14 h-14 rounded-full bg-gold/15 text-gold-dark flex items-center justify-center font-semibold text-lg mb-2">
            {selected.initials}
          </span>
          <p className="font-medium">{selected.name}</p>
          <p className="text-xs text-cardamom/40 mb-5 uppercase tracking-wide">{selected.role}</p>

          <div
            className={`flex gap-3 mb-6 ${shake ? "animate-pulse" : ""}`}
            aria-live="polite"
          >
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 ${
                  i < pin.length
                    ? shake
                      ? "bg-chili border-chili"
                      : "bg-onyx border-onyx"
                    : "border-cardamom/20"
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 w-full">
            {KEYS.map((k, idx) =>
              k === "" ? (
                <span key={idx} />
              ) : (
                <button
                  key={idx}
                  onClick={() => handleKey(k)}
                  className="h-14 rounded-xl bg-white border border-cardamom/10 flex items-center justify-center text-lg font-semibold active:bg-cardamom/10"
                >
                  {k === "back" ? <Delete size={18} /> : k}
                </button>
              )
            )}
          </div>

          {loginError && shake && (
            <p className="text-chili text-sm mt-4">{loginError}</p>
          )}

          <button
            onClick={() => {
              setSelected(null);
              setPin("");
            }}
            className="text-xs text-cardamom/40 underline underline-offset-4 mt-5"
          >
            Not you? Choose a different account
          </button>
        </div>
      )}

      <button
        onClick={() => setSimulateBlocked(true)}
        className="flex items-center gap-1.5 text-[11px] text-cardamom/30 hover:text-cardamom/50 mt-10"
      >
        <WifiOff size={12} /> (demo) simulate off-site network
      </button>
    </div>
  );
}
