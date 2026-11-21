"use client";

import { useAuth } from "@/lib/auth";
import { LoginScreen } from "./LoginScreen";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentStaff, hydrated } = useAuth();

  if (!hydrated) return null;
  if (!currentStaff) return <LoginScreen />;
  return <>{children}</>;
}
