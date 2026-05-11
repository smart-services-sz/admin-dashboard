"use client";

import {
  createContext,
  useContext,
  ReactNode,
} from "react";
import type { AuthUser } from "@/lib/auth.server";

interface AuthContextValue {
  user: AuthUser;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasPermission: (permission: string) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
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
