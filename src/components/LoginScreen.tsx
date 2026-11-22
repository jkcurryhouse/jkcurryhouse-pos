"use client";

import { useRef, useState } from "react";
import { useAuth, RecentAccount } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";
import { Eye, EyeOff, Loader2, X, ArrowLeft } from "lucide-react";

export function LoginScreen() {
  const { login, loginError, recentAccounts, forgetRecentAccount } = useAuth();
  const [mode, setMode] = useState<"pick" | "form">(recentAccounts.length ? "pick" : "form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);
  const chosen = recentAccounts.find((r) => r.email === email);

  function pick(r: RecentAccount) {
    setEmail(r.email);
    setPassword("");
    setMode("form");
    setTimeout(() => pwRef.current?.focus(), 0);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    const ok = await login(email.trim(), password);
    setBusy(false);
    if (!ok) {
      setFailed(true);
      setPassword("");
      pwRef.current?.focus();
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-6 py-10">
      <div className="mb-5">
        <BrandMark tone="light" size="lg" showTagline />
      </div>
      <p className="text-cardamom/50 text-sm mb-8">Sign in to start your shift</p>

      {mode === "pick" ? (
        <div className="w-full max-w-sm">
          <div className="grid grid-cols-2 gap-3">
            {recentAccounts.map((r) => (
              <div key={r.email} className="relative group">
                <button
                  onClick={() => pick(r)}
                  className="w-full flex flex-col items-center gap-2 rounded-xl border border-cardamom/10 bg-white p-4 hover:border-gold/50 hover:shadow-ticket transition-all"
                >
                  <span className="w-12 h-12 rounded-full bg-gold/15 text-gold-dark flex items-center justify-center font-semibold">
                    {r.initials}
                  </span>
                  <span className="text-sm font-medium">{r.name}</span>
                  <span className="text-[10px] text-cardamom/40 truncate max-w-full">{r.email}</span>
                </button>
                <button
                  onClick={() => forgetRecentAccount(r.email)}
                  className="absolute top-1.5 right-1.5 p-1 rounded-full text-cardamom/30 hover:text-chili hover:bg-chili/5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Remove ${r.name} from this device`}
                  title="Remove from this device"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setEmail("");
              setMode("form");
            }}
            className="w-full mt-4 rounded-xl border border-dashed border-cardamom/20 py-3 text-sm font-medium text-cardamom/60 hover:border-gold/50"
          >
            Sign in with another account
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-3" noValidate>
          {chosen ? (
            <div className="flex flex-col items-center mb-2">
              <span className="w-14 h-14 rounded-full bg-gold/15 text-gold-dark flex items-center justify-center font-semibold text-lg mb-2">
                {chosen.initials}
              </span>
              <p className="font-medium">{chosen.name}</p>
              <p className="text-xs text-cardamom/45">{chosen.email}</p>
            </div>
          ) : (
            <label className="block">
              <span className="block text-xs font-semibold text-cardamom/60 mb-1">Email</span>
              <input
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/70 focus:ring-2 focus:ring-gold/20"
                placeholder="you@jkcurryhouse.co.uk"
              />
            </label>
          )}
          <label className="block">
            <span className="block text-xs font-semibold text-cardamom/60 mb-1">Password</span>
            <div className="relative">
              <input
                ref={pwRef}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                autoFocus={!!chosen}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFailed(false);
                }}
                className="w-full rounded-lg border border-cardamom/15 bg-white pl-3 pr-10 py-2.5 text-sm outline-none focus:border-gold/70 focus:ring-2 focus:ring-gold/20"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-cardamom/40 hover:text-cardamom"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {failed && loginError && (
            <p className="text-chili text-sm text-center" role="alert">
              {loginError}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="mt-1 rounded-xl bg-onyx text-ivory font-semibold py-3 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />} Sign in
          </button>
          {recentAccounts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMode("pick");
                setPassword("");
                setFailed(false);
              }}
              className="flex items-center justify-center gap-1 text-xs text-cardamom/50 mt-1"
            >
              <ArrowLeft size={12} /> Choose a different account
            </button>
          )}
          <p className="text-[11px] text-cardamom/40 text-center mt-3">
            Forgotten your password? Ask a manager with admin access to reset it.
          </p>
        </form>
      )}
    </div>
  );
}
