"use client";

import { useMemo, useState } from "react";
import { useAuth, ManagerApproval } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { isManagerRole } from "@/lib/types";
import { X, ShieldCheck, Loader2 } from "lucide-react";

/** A manager picks their name and re-enters their password to authorise one override
 * (refund, void, staff discount) on someone else's session. */
export function ManagerApprovalModal({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** Receives a short-lived signed approval the server checks when the change is saved. */
  onConfirm: (approval: ManagerApproval) => void;
  onCancel: () => void;
}) {
  const { requestManagerApproval } = useAuth();
  const { staffDirectory } = useStore();
  const managers = useMemo(() => staffDirectory.filter((s) => isManagerRole(s.role)), [staffDirectory]);
  const [managerId, setManagerId] = useState(managers.length === 1 ? managers[0].id : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!managerId || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      onConfirm(await requestManagerApproval(managerId, password, title));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify that password");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button className="absolute inset-0 bg-cardamom/50" onClick={onCancel} aria-label="Cancel" />
      <form onSubmit={submit} className="relative bg-ivory rounded-2xl shadow-ticket w-full max-w-sm p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-chili" />
            <h3 className="font-display text-lg">{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-full hover:bg-cardamom/5" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-cardamom/50 mb-4">A manager needs to authorise this with their password. Needs a connection to the server.</p>
        <label className="block mb-3">
          <span className="block text-xs font-semibold text-cardamom/60 mb-1">Manager</span>
          <select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className="w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-chili/60"
          >
            <option value="">Choose…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-cardamom/60 mb-1">Manager&apos;s password</span>
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-chili/60"
            autoFocus={!!managerId}
          />
        </label>
        {error && <p className="text-chili text-xs mt-2 text-center" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={!managerId || !password || busy}
          className="w-full mt-4 rounded-xl bg-chili text-ivory font-semibold py-2.5 disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />} Authorise
        </button>
      </form>
    </div>
  );
}
