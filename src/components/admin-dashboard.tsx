"use client";

import { type ReactNode, useState } from "react";
import type { AuthUser } from "@/lib/auth.server";
import { useAuth } from "@/components/auth-context";
import { AccessManagementPanel, type AccessSection } from "./access-management-panel";
import { ReclamosPanel } from "./reclamos-panel";
import { LogoutButton } from "@/components/logout-button";
import styles from "./admin-dashboard.module.css";

type Section = "reclamos" | "metricas" | AccessSection;
type Theme = "light" | "dark";

const sectionTitles: Record<Section, string> = {
  reclamos: "Gestion de reclamos",
  metricas: "Metricas operativas",
  users: "Administracion de usuarios",
  roles: "Administracion de roles",
  permissions: "Administracion de permisos",
};

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className={styles.navIcon} aria-hidden="true">
      {children}
    </span>
  );
}

function ReclamosIcon() {
  return (
    <MenuIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </svg>
    </MenuIcon>
  );
}

function MetricsIcon() {
  return (
    <MenuIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 19.5h15" />
        <path d="M6.5 16.5V12" />
        <path d="M11 16.5V7.5" />
        <path d="M15.5 16.5V10" />
        <path d="M20.5 5.5l-5 5-3-3-4 4" />
      </svg>
    </MenuIcon>
  );
}

function UsersIcon() {
  return (
    <MenuIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16.5 20v-1.5A4.5 4.5 0 0 0 12 14h-4A4.5 4.5 0 0 0 3.5 18.5V20" />
        <path d="M10 10.5A3.5 3.5 0 1 0 10 3.5a3.5 3.5 0 0 0 0 7Z" />
        <path d="M20.5 20v-1a4 4 0 0 0-3-3.87" />
        <path d="M16.5 3.9a3.2 3.2 0 0 1 0 6.2" />
      </svg>
    </MenuIcon>
  );
}

function RolesIcon() {
  return (
    <MenuIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.5 7.5h13" />
        <path d="M5.5 12h9.5" />
        <path d="M5.5 16.5h13" />
        <path d="M18.5 6.5l2 1-2 1" />
      </svg>
    </MenuIcon>
  );
}

function PermissionsIcon() {
  return (
    <MenuIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 4.5a5 5 0 1 0 5 5" />
        <path d="M14.5 4.5 9 10v3h3l5.5-5.5" />
        <path d="M9 10l2.5 2.5" />
      </svg>
    </MenuIcon>
  );
}

type AdminDashboardProps = {
  user: AuthUser;
};

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const { hasRole, hasPermission } = useAuth();

  const canViewReclamos = hasPermission("VIEW_RECLAMOS") || hasRole("ADMIN") || hasRole("AGENT");
  const canManageAccess = hasRole("ADMIN");

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("reclamos");

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const savedTheme = window.localStorage.getItem("dashboard-theme");

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const handleSidebarToggle = () => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(min-width: 1024px)").matches) {
      setIsSidebarCollapsed((prev) => !prev);
      return;
    }

    setIsSidebarOpen((prev) => !prev);
  };

  const toggleTheme = () => {
    setTheme((prev) => {
      const nextTheme: Theme = prev === "light" ? "dark" : "light";
      window.localStorage.setItem("dashboard-theme", nextTheme);
      return nextTheme;
    });
  };

  const renderMainContent = () => {
    if (activeSection === "metricas") {
      return (
        <section className={styles.placeholderCard}>
          <h2>Metricas</h2>
          <p>
            Aqui puedes agregar graficos y reportes del flujo de reclamos cuando
            conectemos con los microservicios.
          </p>
        </section>
      );
    }

    if (activeSection === "reclamos" && !canViewReclamos) {
      return (
        <section className={styles.placeholderCard}>
          <h2>Acceso denegado</h2>
          <p>No tienes permisos para ver los reclamos.</p>
        </section>
      );
    }

    if (
      activeSection === "users" ||
      activeSection === "roles" ||
      activeSection === "permissions"
    ) {
      if (!canManageAccess) {
        return (
          <section className={styles.placeholderCard}>
            <h2>Acceso denegado</h2>
            <p>No tienes permisos para acceder a esta sección administrativa.</p>
          </section>
        );
      }
      return <AccessManagementPanel section={activeSection} />;
    }

    return <ReclamosPanel />;
  };

  return (
    <div className={styles.dashboardShell} data-theme={theme}>
      <div
        className={styles.backdrop}
        aria-hidden={!isSidebarOpen}
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside
        className={styles.sidebar}
        data-open={isSidebarOpen}
        data-collapsed={isSidebarCollapsed}
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.brandBlock}>
            <span className={styles.brandDot} />
            <div>
              <strong>SmartService</strong>
              <small>Admin dashboard</small>
            </div>
          </div>
        </div>

        <nav className={styles.navMenu}>
          {canViewReclamos && (
            <button
              type="button"
              data-active={activeSection === "reclamos"}
              onClick={() => {
                setActiveSection("reclamos");
                setIsSidebarOpen(false);
              }}
            >
              <ReclamosIcon />
              <span className={styles.navLabel}>Reclamos</span>
            </button>
          )}
          <button
            type="button"
            data-active={activeSection === "metricas"}
            onClick={() => {
              setActiveSection("metricas");
              setIsSidebarOpen(false);
            }}
          >
            <MetricsIcon />
            <span className={styles.navLabel}>Metricas</span>
          </button>
          {canManageAccess && (
            <>
              <button
                type="button"
                data-active={activeSection === "users"}
                onClick={() => {
                  setActiveSection("users");
                  setIsSidebarOpen(false);
                }}
              >
                <UsersIcon />
                <span className={styles.navLabel}>Usuarios</span>
              </button>
              <button
                type="button"
                data-active={activeSection === "roles"}
                onClick={() => {
                  setActiveSection("roles");
                  setIsSidebarOpen(false);
                }}
              >
                <RolesIcon />
                <span className={styles.navLabel}>Roles</span>
              </button>
              <button
                type="button"
                data-active={activeSection === "permissions"}
                onClick={() => {
                  setActiveSection("permissions");
                  setIsSidebarOpen(false);
                }}
              >
                <PermissionsIcon />
                <span className={styles.navLabel}>Permisos</span>
              </button>
            </>
          )}
        </nav>
      </aside>

      <div className={styles.pageColumn}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              className={styles.sidebarToggle}
              type="button"
              onClick={handleSidebarToggle}
              aria-label="Abrir o cerrar menu lateral"
              aria-expanded={isSidebarOpen || !isSidebarCollapsed}
              data-open={isSidebarOpen || !isSidebarCollapsed}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <p>Panel administrativo</p>
              <strong>{sectionTitles[activeSection]}</strong>
            </div>
          </div>

          <div className={styles.topbarActions}>
            <div className={styles.userBadge}>
              <strong>{user.name || user.email}</strong>
              <span>{user.roles.join(", ") || "Sin roles"}</span>
            </div>
            <button
              className={styles.themeSwitch}
              type="button"
              onClick={toggleTheme}
              aria-label="Alternar tema claro y oscuro"
            >
              {theme === "dark" ? "☀ Claro" : "🌙 Oscuro"}
            </button>
            <button className={styles.primaryAction} type="button">
              Exportar reporte
            </button>
            <LogoutButton />
          </div>
        </header>

        <main className={styles.mainContent}>{renderMainContent()}</main>

        <footer className={styles.footer}>
          <p>SmartService 2026</p>
          <span>Construido con Next.js</span>
        </footer>
      </div>
    </div>
  );
}
