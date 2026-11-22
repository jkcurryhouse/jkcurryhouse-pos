"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiClientError, UNAUTHORIZED_EVENT } from "./api";
import { StaffAccount } from "./types";

// The session is an httpOnly cookie set by /api/auth/login. We keep a copy of *who* is signed
// in so a terminal that reloads while offline still knows its user.
const SESSION_KEY = "jkpos-session-v3";
// Name + email of people who recently signed in on this device, for one-tap shift handover.
// Never contains passwords.
const RECENT_KEY = "jkpos-recent-accounts-v1";
const MAX_RECENT = 8;
const DEFAULT_INACTIVITY_MINUTES = 10;

export interface ManagerApproval {
  managerId: string;
  managerName: string;
  token: string;
}

export interface RecentAccount {
  email: string;
  name: string;
  initials: string;
}

interface AuthShape {
  currentStaff: StaffAccount | null;
  loginError: string | null;
  recentAccounts: RecentAccount[];
  forgetRecentAccount: (email: string) => void;
  login: (email: string, password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestManagerApproval: (managerId: string, password: string, purpose: string) => Promise<ManagerApproval>;
  logout: () => void;
  switchAccount: () => void;
  hydrated: boolean;
  inactivityLimitMinutes: number;
  setInactivityLimitMinutes: (m: number) => void;
}

const AuthContext = createContext<AuthShape | null>(null);

function readRecent(): RecentAccount[] {
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentStaff, setCurrentStaff] = useState<StaffAccount | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [inactivityLimitMinutes, setInactivityLimitMinutes] = useState(DEFAULT_INACTIVITY_MINUTES);
  const lastActivity = useRef(Date.now());

  const remember = useCallback((s: StaffAccount) => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    if (!s.email) return;
    const next = [{ email: s.email, name: s.name, initials: s.initials }, ...readRecent().filter((r) => r.email !== s.email)].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecentAccounts(next);
  }, []);

  const forget = useCallback(() => {
    setCurrentStaff(null);
    window.sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const forgetRecentAccount = useCallback((email: string) => {
    const next = readRecent().filter((r) => r.email !== email);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecentAccounts(next);
  }, []);

  // Hydrate: confirm the cookie session with the server; fall back to the cached identity
  // only if the server is unreachable (offline reload).
  useEffect(() => {
    setRecentAccounts(readRecent());
    (async () => {
      try {
        const { staff } = await api<{ staff: StaffAccount }>("/api/auth/me");
        setCurrentStaff(staff);
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(staff));
      } catch (e) {
        if (e instanceof ApiClientError && e.isNetwork) {
          try {
            const raw = window.sessionStorage.getItem(SESSION_KEY);
            if (raw) setCurrentStaff(JSON.parse(raw));
          } catch {}
        } else {
          window.sessionStorage.removeItem(SESSION_KEY);
        }
      }
      setHydrated(true);
    })();
  }, []);

  // Any API call that comes back 401 (expired session, password reset, account deactivated) signs out.
  useEffect(() => {
    const onUnauth = () => forget();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauth);
  }, [forget]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { staff } = await api<{ staff: StaffAccount }>("/api/auth/login", { body: { email, password } });
        setLoginError(null);
        setCurrentStaff(staff);
        remember(staff);
        lastActivity.current = Date.now();
        return true;
      } catch (e) {
        setLoginError(
          e instanceof ApiClientError && e.isNetwork
            ? "Signing in needs a connection to the server"
            : e instanceof Error
            ? e.message
            : "Sign-in failed"
        );
        return false;
      }
    },
    [remember]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { staff } = await api<{ staff: StaffAccount }>("/api/auth/change-password", {
        body: { currentPassword, newPassword },
      });
      setCurrentStaff(staff);
      remember(staff);
    },
    [remember]
  );

  const requestManagerApproval = useCallback(
    (managerId: string, password: string, purpose: string) =>
      api<ManagerApproval>("/api/auth/manager-approval", { body: { managerId, password, purpose } }),
    []
  );

  const logout = useCallback(() => {
    api("/api/auth/logout", { method: "POST" }).catch(() => {});
    forget();
  }, [forget]);

  const switchAccount = logout;

  // Auto sign-out after configurable inactivity (Admin → Settings)
  useEffect(() => {
    if (!currentStaff) return;
    const limitMs = inactivityLimitMinutes * 60 * 1000;
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current > limitMs) logout();
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(interval);
    };
  }, [currentStaff, logout, inactivityLimitMinutes]);

  const value = useMemo<AuthShape>(
    () => ({
      currentStaff,
      loginError,
      recentAccounts,
      forgetRecentAccount,
      login,
      changePassword,
      requestManagerApproval,
      logout,
      switchAccount,
      hydrated,
      inactivityLimitMinutes,
      setInactivityLimitMinutes,
    }),
    [currentStaff, loginError, recentAccounts, forgetRecentAccount, login, changePassword, requestManagerApproval, logout, switchAccount, hydrated, inactivityLimitMinutes]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
