"use client";

import React, { useCallback, useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export const gbp = (n: number | null | undefined) =>
  `£${(n ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDateTime = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      })
    : "—";

export const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/London" }) : "—";

export const londonDay = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** GET a JSON endpoint with loading/error state and a reload() handle. */
export function useAdminData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
        {subtitle && <p className="text-sm text-cardamom/55 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-cardamom/10 bg-white p-5 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4 gap-2">
          {title && <h2 className="font-semibold text-sm uppercase tracking-wide text-cardamom/60">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-cardamom/10 bg-white px-4 py-4">
      <p className="text-xs font-medium text-cardamom/50">{label}</p>
      <p className="font-display text-2xl mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-cardamom/45 mt-0.5">{hint}</p>}
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
  size?: "sm" | "md";
};
export function Button({ variant = "secondary", busy, size = "md", className = "", children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-onyx text-ivory hover:bg-onyx-light",
    secondary: "bg-white border border-cardamom/15 text-cardamom hover:border-gold/60",
    danger: "bg-chili text-ivory hover:bg-chili-dark",
    ghost: "text-cardamom/70 hover:bg-cardamom/5",
  }[variant];
  const pad = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40 ${pad} ${styles} ${className}`}
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-cardamom/65 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-cardamom/45 mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold/70 focus:ring-2 focus:ring-gold/20";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 shrink-0 rounded-full transition-colors ${checked ? "bg-jade" : "bg-cardamom/20"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <button className="fixed inset-0 bg-cardamom/50" onClick={onClose} aria-label="Close" />
      <div className={`relative bg-ivory w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} sm:rounded-2xl shadow-ticket flex flex-col max-h-[100vh] sm:max-h-[90vh]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-cardamom/10">
          <h2 className="font-display text-xl">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-cardamom/5" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-cardamom/10 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad" | "gold"; children: React.ReactNode }) {
  const t = {
    neutral: "bg-cardamom/5 text-cardamom/70 border-cardamom/10",
    good: "bg-jade/10 text-jade-dark border-jade/20",
    warn: "bg-gold/15 text-gold-dark border-gold/30",
    bad: "bg-chili/10 text-chili-dark border-chili/20",
    gold: "bg-onyx text-gold-light border-onyx",
  }[tone];
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${t}`}>{children}</span>;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg bg-chili/10 border border-chili/20 text-chili-dark text-sm px-3 py-2 mb-4">{error}</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-cardamom/40 text-center py-10">{children}</p>;
}

export const th = "text-left text-[11px] font-semibold uppercase tracking-wide text-cardamom/45 px-3 py-2 whitespace-nowrap";
export const td = "px-3 py-2.5 text-sm border-t border-cardamom/5 align-top";

export function paymentTone(s: string): "good" | "warn" | "bad" | "neutral" {
  return s === "paid" ? "good" : s === "partial" || s === "unpaid" ? "warn" : s === "void" || s === "refunded" ? "bad" : "neutral";
}

/**
 * Single-series bar chart (one hue, thin bars with 4px rounded data-ends on a recessive
 * baseline). Hover/focus shows the exact value; the same numbers are always shown in a
 * table next to it on the page.
 */
export function BarChart({
  data,
  format = gbp,
  height = 160,
  label,
}: {
  data: { key: string; label: string; value: number; sub?: string }[];
  format?: (n: number) => string;
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const h = hover != null ? data[hover] : null;
  return (
    <figure aria-label={label}>
      <div className="h-6 text-xs text-cardamom/70 tabular-nums">
        {h ? (
          <span>
            <span className="font-semibold text-cardamom">{h.label}</span> · {format(h.value)}
            {h.sub ? ` · ${h.sub}` : ""}
          </span>
        ) : (
          <span className="text-cardamom/40">Hover a bar for details</span>
        )}
      </div>
      <div className="flex items-end gap-[2px] border-b border-cardamom/15" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button
            key={d.key}
            type="button"
            aria-label={`${d.label}: ${format(d.value)}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="flex-1 h-full flex items-end justify-center group outline-none"
          >
            <span
              className={`w-full max-w-[28px] rounded-t-[4px] transition-colors ${hover === i ? "bg-onyx" : "bg-gold-dark"}`}
              style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 text-center text-[10px] text-cardamom/45 truncate">
            {data.length > 16 ? (i % Math.ceil(data.length / 8) === 0 ? d.label : "") : d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const presets: [string, number][] = [
    ["Today", 0],
    ["7 days", 6],
    ["30 days", 29],
    ["90 days", 89],
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map(([l, d]) => {
        const active = from === londonDay(-d) && to === londonDay(0);
        return (
          <button
            key={l}
            onClick={() => onChange(londonDay(-d), londonDay(0))}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${active ? "bg-onyx text-ivory border-onyx" : "bg-white border-cardamom/15 text-cardamom/70"}`}
          >
            {l}
          </button>
        );
      })}
      <input type="date" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} className={`${inputCls} !w-auto !py-1.5 text-xs`} aria-label="From date" />
      <span className="text-xs text-cardamom/40">to</span>
      <input type="date" value={to} min={from} onChange={(e) => onChange(from, e.target.value)} className={`${inputCls} !w-auto !py-1.5 text-xs`} aria-label="To date" />
    </div>
  );
}

/** Wraps a mutating API call with busy/error state for forms. */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
