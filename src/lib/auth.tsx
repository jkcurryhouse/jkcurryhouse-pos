"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { staffAccounts } from "./mock-data";
import { StaffAccount } from "./types";

const SESSION_KEY = "anand-pos-session-v1";
const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes, configurable per requirements 1.1

interface AuthShape {
  currentStaff: StaffAccount | null;
  loginError: string | null;
  loginWithPin: (pin: string) => boolean;
  logout: () => void;
  switchAccount: () => void;
  hydrated: boolean;
  inactivityLimitMinutes: number;
}

const AuthContext = createContext<AuthShape | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentStaff, setCurrentStaff] = useState<StaffAccount | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const staffId = JSON.parse(raw) as string;
        const found = staffAccounts.find((s) => s.id === staffId);
        if (found) setCurrentStaff(found);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const loginWithPin = useCallback((pin: string) => {
    const match = staffAccounts.find((s) => s.pin === pin);
    if (!match) {
      setLoginError("PIN not recognised — try again");
      return false;
    }
    setLoginError(null);
    setCurrentStaff(match);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(match.id));
    lastActivity.current = Date.now();
    return true;
  }, []);

  const logout = useCallback(() => {
    setCurrentStaff(null);
    window.sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const switchAccount = useCallback(() => {
    setCurrentStaff(null);
    window.sessionStorage.removeItem(SESSION_KEY);
  }, []);

  // Auto-logout after configurable inactivity, per requirement 1.1
  useEffect(() => {
    if (!currentStaff) return;
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current > INACTIVITY_LIMIT_MS) {
        logout();
      }
    }, 5000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(interval);
    };
  }, [currentStaff, logout]);

  const value = useMemo<AuthShape>(
    () => ({
      currentStaff,
      loginError,
      loginWithPin,
      logout,
      switchAccount,
      hydrated,
      inactivityLimitMinutes: INACTIVITY_LIMIT_MS / 60000,
    }),
    [currentStaff, loginError, loginWithPin, logout, switchAccount, hydrated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
