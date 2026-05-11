import { redirect } from "next/navigation";
import { getServerUser, AuthUser } from "@/lib/auth.server";

/**
 * Server-side guard: ensures the current user has at least one of the
 * allowed roles. Redirects to /login if unauthenticated, or to
 * /no-access if the user lacks the required role.
 *
 * Usage in a Server Component or Server Action:
 *   const user = await requireRole(["ADMIN"]);
 */
export async function requireRole(allowedRoles: string[]): Promise<AuthUser> {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const hasRole = user.roles.some((r) => allowedRoles.includes(r));

  if (!hasRole) {
    redirect("/no-access");
  }

  return user;
}
