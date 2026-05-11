import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getServerUser } from "@/lib/auth.server";
import styles from "./page.module.css";

export default async function LoginPage() {
  const user = await getServerUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className={styles.loginShell}>
      <div className={styles.glowA} aria-hidden="true" />
      <div className={styles.glowB} aria-hidden="true" />

      <main className={styles.loginCard}>
        <section className={styles.heroColumn}>
          <p className={styles.kicker}>SmartService Admin</p>
          <h1>Controla tus reclamos desde un solo lugar</h1>
          <p className={styles.description}>
            Accede al panel para gestionar incidencias, seguimiento y estado de
            atencion desde cualquier dispositivo.
          </p>

          <ul className={styles.featureList}>
            <li>Vista centralizada de reclamos</li>
            <li>Seguimiento por estado y prioridad</li>
            <li>Panel responsive para operaciones diarias</li>
          </ul>
        </section>

        <section className={styles.formColumn}>
          <header className={styles.formHeader}>
            <h2>Iniciar sesion</h2>
            <p>Ingresa con tu cuenta administrativa</p>
          </header>

          <LoginForm />

          <footer className={styles.cardFooter}>
            <span>Sesion web protegida por cookies httpOnly</span>
            <Link href="/">Ir al dashboard</Link>
          </footer>
        </section>
      </main>
    </div>
  );
}
