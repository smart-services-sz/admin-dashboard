import { redirect } from "next/navigation";
import { getServerUser, AuthUser } from "@/lib/auth.server";

/**
 * Server-side guard: ensures the current user holds all of the required
 * permissions. Redirects to /login if unauthenticated, or to
 * /no-access if the user is missing any required permission.
 *
 * Usage in a Server Component or Server Action:
 *   const user = await requirePermission(["VIEW_RECLAMOS"]);
 */
export async function requirePermission(
  requiredPermissions: string[],
): Promise<AuthUser> {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const hasAll = requiredPermissions.every((p) =>
    user.permissions.includes(p),
  );

  if (!hasAll) {
    redirect("/no-access");
  }

  return user;
}
