import { useAuth } from "@/components/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface WithPermissionProps {
  requiredRoles?: string[];
  requiredPermissions?: string[];
  children: React.ReactNode;
}

export function WithPermission({ requiredRoles, requiredPermissions, children }: WithPermissionProps) {
  const { hasRole, hasAllPermissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    let allowed = true;
    if (requiredRoles && requiredRoles.length > 0) {
      allowed = requiredRoles.some((role) => hasRole(role));
    }
    if (allowed && requiredPermissions && requiredPermissions.length > 0) {
      allowed = hasAllPermissions(requiredPermissions);
    }
    if (!allowed) {
      router.replace("/no-access");
    }
  }, [requiredRoles, requiredPermissions, hasRole, hasAllPermissions, router]);

  return <>{children}</>;
}
