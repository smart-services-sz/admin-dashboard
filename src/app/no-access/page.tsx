import Link from "next/link";
import { getServerUser } from "@/lib/auth.server";

export default async function NoAccessPage() {
  const user = await getServerUser();

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "3rem", margin: 0 }}>403</h1>
      <h2 style={{ margin: 0 }}>Acceso denegado</h2>
      <p style={{ color: "#666", maxWidth: "28rem" }}>
        No tienes los permisos necesarios para acceder a esta seccion.
        {user ? (
          <>
            {" "}
            Estas autenticado como <strong>{user.email}</strong> con los
            roles: <strong>{user.roles.join(", ") || "ninguno"}</strong>.
          </>
        ) : null}
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/"
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            background: "#2563eb",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Ir al panel
        </Link>
        {!user && (
          <Link
            href="/login"
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #2563eb",
              color: "#2563eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Iniciar sesion
          </Link>
        )}
      </div>
    </div>
  );
}
