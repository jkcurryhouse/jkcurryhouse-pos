"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** Shared by the forced first-sign-in screen and the "Change my password" dialog. */
export function ChangePasswordForm({ onDone, currentLabel = "Current password" }: { onDone?: () => void; currentLabel?: string }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < 10;
  const mismatch = confirm.length > 0 && confirm !== next;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 10) return setError("Use at least 10 characters");
    if (next !== confirm) return setError("The new passwords don't match");
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the password");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/70 focus:ring-2 focus:ring-gold/20";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label className="block">
        <span className="block text-xs font-semibold text-cardamom/60 mb-1">{currentLabel}</span>
        <input type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} autoFocus />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-cardamom/60 mb-1">New password</span>
        <input type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
        <span className={`block text-[11px] mt-1 ${tooShort ? "text-chili" : "text-cardamom/45"}`}>
          At least 10 characters. A short phrase like “three random words” works well.
        </span>
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-cardamom/60 mb-1">Confirm new password</span>
        <input type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
        {mismatch && <span className="block text-[11px] mt-1 text-chili">Doesn&apos;t match yet</span>}
      </label>
      <button type="button" onClick={() => setShow((v) => !v)} className="self-start flex items-center gap-1.5 text-xs text-cardamom/55">
        {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? "Hide" : "Show"} passwords
      </button>
      {error && (
        <p className="text-chili text-sm" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !current || !next || !confirm}
        className="rounded-xl bg-onyx text-ivory font-semibold py-3 disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 size={16} className="animate-spin" />} Save new password
      </button>
      <p className="text-[11px] text-cardamom/40">Changing your password signs you out on every other device.</p>
    </form>
  );
}
