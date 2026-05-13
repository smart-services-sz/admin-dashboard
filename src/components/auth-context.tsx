"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import type { AuthUser } from "@/lib/auth.server";
import { endpoints } from "@/config/api";

// Refresh proactively at 80% of TTL (900s * 0.8 = 720s ≈ 12 min)
const REFRESH_INTERVAL_MS = 720_000;
// Minimum time between refreshes triggered by visibility change
const MIN_REFRESH_GAP_MS = 60_000;

interface AuthContextValue {
  user: AuthUser;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasPermission: (permission: string) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function silentRefresh(): Promise<void> {
  try {
    await fetch(endpoints.refresh, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Refresh failed silently – the JwtAuthGuard will redirect to login on next request
  }
}

export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    // Periodic proactive refresh
    const timer = setInterval(async () => {
      await silentRefresh();
      lastRefreshRef.current = Date.now();
    }, REFRESH_INTERVAL_MS);

    // Refresh when the user returns to the tab after a long absence
    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefreshRef.current > MIN_REFRESH_GAP_MS
      ) {
        await silentRefresh();
        lastRefreshRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const value: AuthContextValue = {
    user,
    hasRole: (role) => user.roles.includes(role),
    hasAnyRole: (roles) => roles.some((r) => user.roles.includes(r)),
    hasPermission: (permission) => user.permissions.includes(permission),
    hasAllPermissions: (permissions) =>
      permissions.every((p) => user.permissions.includes(p)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Client hook to read the authenticated user and role/permission helpers.
 * Must be used inside an <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return ctx;
}
