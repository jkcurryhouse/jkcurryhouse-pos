"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface ConnectivityShape {
  isOnline: boolean;
  simulatedOffline: boolean;
  toggleSimulatedOffline: () => void;
}

const ConnectivityContext = createContext<ConnectivityShape | null>(null);

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [simulatedOffline, setSimulatedOffline] = useState(false);

  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const value = useMemo<ConnectivityShape>(
    () => ({
      isOnline: browserOnline && !simulatedOffline,
      simulatedOffline,
      toggleSimulatedOffline: () => setSimulatedOffline((s) => !s),
    }),
    [browserOnline, simulatedOffline]
  );

  return (
    <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error("useConnectivity must be used within ConnectivityProvider");
  return ctx;
}
