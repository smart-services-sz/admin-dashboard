"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import styles from "./admin-dashboard.module.css";
import { authService } from "@/services/auth.service";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLogout = async () => {
    try {
      await authService.logout();
    } finally {
      startTransition(() => {
        router.replace("/login");
        router.refresh();
      });
    }
  };

  return (
    <button
      className={styles.secondaryAction}
      type="button"
      onClick={handleLogout}
      disabled={isPending}
    >
      {isPending ? "Saliendo..." : "Cerrar sesion"}
    </button>
  );
}
