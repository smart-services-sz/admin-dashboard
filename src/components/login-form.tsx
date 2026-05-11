"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import styles from "@/app/login/page.module.css";
import { authService } from "@/services/auth.service";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await authService.login({ email, password });
      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo iniciar sesion",
      );
    }
  };

  return (
    <form className={styles.loginForm} onSubmit={handleSubmit}>
      <label>
        Correo
        <input
          type="email"
          placeholder="admin@smartservice.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label>
        Contrasena
        <input
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      <div className={styles.formMetaRow}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          Recordarme
        </label>
        <span aria-hidden="true">Acceso por cookies seguras</span>
      </div>

      {error ? <p className={styles.formError}>{error}</p> : null}

      <button type="submit" className={styles.primaryButton} disabled={isPending}>
        {isPending ? "Ingresando..." : "Entrar al panel"}
      </button>
      <button type="button" className={styles.secondaryButton} disabled>
        Ingresar con SSO
      </button>
    </form>
  );
}
