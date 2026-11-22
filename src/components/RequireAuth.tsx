"use client";

import { useAuth } from "@/lib/auth";
import { LoginScreen } from "./LoginScreen";
import { BrandMark } from "./BrandMark";
import { ChangePasswordForm } from "./ChangePasswordForm";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentStaff, hydrated, logout } = useAuth();

  if (!hydrated) return null;
  if (!currentStaff) return <LoginScreen />;
  if (currentStaff.mustChangePassword) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-6 py-10">
        <div className="mb-5">
          <BrandMark tone="light" size="lg" />
        </div>
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl text-center">Choose your password</h1>
          <p className="text-sm text-cardamom/55 text-center mt-1 mb-6">
            Hi {currentStaff.name.split(" ")[0]} — you signed in with a temporary password. Set your own to continue.
          </p>
          <ChangePasswordForm currentLabel="Temporary password" />
          <button onClick={logout} className="w-full text-xs text-cardamom/50 mt-4">
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
