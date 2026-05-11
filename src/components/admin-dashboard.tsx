"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AuthUser } from "@/lib/auth.server";
import { useAuth } from "@/components/auth-context";
import { LogoutButton } from "@/components/logout-button";
import styles from "./admin-dashboard.module.css";

type ComplaintStatus = "Pendiente" | "En proceso" | "Resuelto";
type ComplaintPriority = "Alta" | "Media" | "Baja";
type Section = "reclamos" | "metricas" | "ajustes";
type Theme = "light" | "dark";

type Complaint = {
  id: number;
  trackingCode: string;
  customer: string;
  subject: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  createdAt: string;
};

type FormValues = {
  customer: string;
  subject: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
};

const initialComplaints: Complaint[] = [
  {
    id: 1,
    trackingCode: "REC-2026-001",
    customer: "Maria Gomez",
    subject: "Demora en asistencia tecnica",
    status: "Pendiente",
    priority: "Alta",
    createdAt: "2026-05-09",
  },
  {
    id: 2,
    trackingCode: "REC-2026-002",
    customer: "Carlos Pena",
    subject: "Error en facturacion",
    status: "En proceso",
    priority: "Media",
    createdAt: "2026-05-10",
  },
  {
    id: 3,
    trackingCode: "REC-2026-003",
    customer: "Lucia Rojas",
    subject: "Incumplimiento de horario",
    status: "Resuelto",
    priority: "Baja",
    createdAt: "2026-05-11",
  },
];

const emptyForm: FormValues = {
  customer: "",
  subject: "",
  status: "Pendiente",
  priority: "Media",
};

type AdminDashboardProps = {
  user: AuthUser;
};

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const { hasRole, hasPermission } = useAuth();

  const canViewReclamos = hasPermission("VIEW_RECLAMOS") || hasRole("ADMIN") || hasRole("AGENT");
  const canManageReclamos = hasPermission("MANAGE_RECLAMOS") || hasRole("ADMIN");
  const canDeleteReclamos = hasPermission("DELETE_RECLAMOS") || hasRole("ADMIN");
  const canViewAjustes = hasRole("ADMIN");

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("reclamos");
  const [complaints, setComplaints] = useState<Complaint[]>(initialComplaints);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formValues, setFormValues] = useState<FormValues>(emptyForm);

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

  const toggleTheme = () => {
    setTheme((prev) => {
      const nextTheme: Theme = prev === "light" ? "dark" : "light";
      window.localStorage.setItem("dashboard-theme", nextTheme);
      return nextTheme;
    });
  };

  const totalOpen = useMemo(
    () => complaints.filter((item) => item.status !== "Resuelto").length,
    [complaints],
  );

  const nextId = useMemo(
    () => Math.max(0, ...complaints.map((item) => item.id)) + 1,
    [complaints],
  );

  const updateFormField = <K extends keyof FormValues>(
    field: K,
    value: FormValues[K],
  ) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setFormValues(emptyForm);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formValues.customer.trim() || !formValues.subject.trim()) {
      return;
    }

    if (editingId !== null) {
      setComplaints((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                customer: formValues.customer.trim(),
                subject: formValues.subject.trim(),
                status: formValues.status,
                priority: formValues.priority,
              }
            : item,
        ),
      );
      resetForm();
      return;
    }

    const now = new Date();
    const createdAt = now.toISOString().slice(0, 10);

    const newComplaint: Complaint = {
      id: nextId,
      trackingCode: `REC-${now.getFullYear()}-${String(nextId).padStart(3, "0")}`,
      customer: formValues.customer.trim(),
      subject: formValues.subject.trim(),
      status: formValues.status,
      priority: formValues.priority,
      createdAt,
    };

    setComplaints((prev) => [newComplaint, ...prev]);
    resetForm();
  };

  const startEdit = (item: Complaint) => {
    setEditingId(item.id);
    setFormValues({
      customer: item.customer,
      subject: item.subject,
      status: item.status,
      priority: item.priority,
    });
  };

  const removeComplaint = (id: number) => {
    setComplaints((prev) => prev.filter((item) => item.id !== id));

    if (editingId === id) {
      resetForm();
    }
  };

  const renderMainContent = () => {
    if (activeSection === "metricas") {
      return (
        <section className={styles.placeholderCard}>
          <h2>Metricas</h2>
          <p>
            Aqui puedes agregar graficos y reportes del flujo de reclamos cuando
            conectemos con los microservicios.</p>
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

    if (activeSection === "ajustes") {
      if (!canViewAjustes) {
        return (
          <section className={styles.placeholderCard}>
            <h2>Acceso denegado</h2>
            <p>No tienes permisos para acceder a Ajustes.</p>
          </section>
        );
      }
      return (
        <section className={styles.placeholderCard}>
          <h2>Ajustes</h2>
          <p>
            Seccion lista para configurar usuarios, permisos y reglas de
            negocio del panel.
          </p>
        </section>
      );
    }

    return (
      <>
        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <p>Total reclamos</p>
            <strong>{complaints.length}</strong>
          </article>
          <article className={styles.metricCard}>
            <p>Activos</p>
            <strong>{totalOpen}</strong>
          </article>
          <article className={styles.metricCard}>
            <p>Resueltos</p>
            <strong>{complaints.length - totalOpen}</strong>
          </article>
        </section>

        <section className={styles.contentGrid}>
          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Listado de reclamos</h2>
              <span>{complaints.length} registros</span>
            </header>

            <div className={styles.complaintsList}>
              {complaints.map((item) => (
                <article className={styles.complaintCard} key={item.id}>
                  <div className={styles.complaintTopRow}>
                    <span className={styles.trackingCode}>{item.trackingCode}</span>
                    <span
                      className={styles.statusPill}
                      data-status={item.status.replace(" ", "-").toLowerCase()}
                    >
                      {item.status}
                    </span>
                  </div>

                  <h3>{item.subject}</h3>
                  <p>{item.customer}</p>

                  <div className={styles.complaintMeta}>
                    <span>Prioridad: {item.priority}</span>
                    <span>Fecha: {item.createdAt}</span>
                  </div>

                  <div className={styles.actionsRow}>
                    {canManageReclamos && (
                      <button type="button" onClick={() => startEdit(item)}>
                        Editar
                      </button>
                    )}
                    {canDeleteReclamos && (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => removeComplaint(item.id)}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </article>

          {canManageReclamos && (
          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>{editingId !== null ? "Editar reclamo" : "Nuevo reclamo"}</h2>
              {editingId !== null ? (
                <button
                  className={styles.cancelInlineButton}
                  type="button"
                  onClick={resetForm}
                >
                  Cancelar edicion
                </button>
              ) : null}
            </header>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label>
                Cliente
                <input
                  type="text"
                  value={formValues.customer}
                  onChange={(event) =>
                    updateFormField("customer", event.target.value)
                  }
                  placeholder="Nombre del cliente"
                  required
                />
              </label>

              <label>
                Asunto
                <input
                  type="text"
                  value={formValues.subject}
                  onChange={(event) =>
                    updateFormField("subject", event.target.value)
                  }
                  placeholder="Resumen del reclamo"
                  required
                />
              </label>

              <label>
                Estado
                <select
                  value={formValues.status}
                  onChange={(event) =>
                    updateFormField("status", event.target.value as ComplaintStatus)
                  }
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="En proceso">En proceso</option>
                  <option value="Resuelto">Resuelto</option>
                </select>
              </label>

              <label>
                Prioridad
                <select
                  value={formValues.priority}
                  onChange={(event) =>
                    updateFormField(
                      "priority",
                      event.target.value as ComplaintPriority,
                    )
                  }
                >
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Baja">Baja</option>
                </select>
              </label>

              <button className={styles.submitButton} type="submit">
                {editingId !== null ? "Guardar cambios" : "Crear reclamo"}
              </button>
            </form>
          </article>
          )}
        </section>
      </>
    );
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

          <button
            className={styles.iconButton}
            type="button"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            aria-label="Alternar ancho del sidebar"
          >
            {isSidebarCollapsed ? ">" : "<"}
          </button>
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
              Reclamos
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
            Metricas
          </button>
          {canViewAjustes && (
            <button
              type="button"
              data-active={activeSection === "ajustes"}
              onClick={() => {
                setActiveSection("ajustes");
                setIsSidebarOpen(false);
              }}
            >
              Ajustes
            </button>
          )}
        </nav>
      </aside>

      <div className={styles.pageColumn}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-label="Abrir menu lateral"
            >
              ≡
            </button>
            <div>
              <p>Panel administrativo</p>
              <strong>Gestion de reclamos</strong>
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
