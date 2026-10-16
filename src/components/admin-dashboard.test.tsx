import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import AdminDashboard from "./admin-dashboard";

const { auth } = vi.hoisted(() => ({ auth: { roles: ["AGENT"] } }));

vi.mock("@/components/auth-context", () => ({ useAuth: () => ({
  hasRole: (role: string) => auth.roles.includes(role),
  hasPermission: () => true,
}) }));
vi.mock("./agent-routes-panel", () => ({ AgentRoutesPanel: () => <p>Trabajos del agente</p> }));
vi.mock("./reclamos-panel", () => ({ ReclamosPanel: () => <p>Gestion general de reclamos</p> }));
vi.mock("./routing-plans-panel", () => ({ RoutingPlansPanel: () => <p>Planes administrativos</p> }));
vi.mock("./routing-routes-panel", () => ({ RoutingRoutesPanel: () => <p>Generacion de rutas</p> }));
vi.mock("./routing-generated-panel", () => ({ RoutingGeneratedPanel: () => <p>Rutas administrativas</p> }));
vi.mock("./access-management-panel", () => ({ AccessManagementPanel: () => <p>Accesos</p> }));
vi.mock("./municipal-config-panel", () => ({ MunicipalConfigPanel: () => <p>Panel de municipios</p> }));
vi.mock("./audit-logs-panel", () => ({ AuditLogsPanel: () => <p>Panel de auditoria</p> }));
vi.mock("./reclamos-metrics-panel", () => ({ ReclamosMetricsPanel: () => <p>Metricas municipales</p> }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => <button>Salir</button> }));

describe("AdminDashboard role navigation", () => {
  beforeEach(() => {
    auth.roles = ["AGENT"];
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false }) });
  });

  it("shows only assigned work for AGENT even with claims permissions", () => {
    render(<AdminDashboard user={{ userId: "agent-1", email: "agent@test.local", roles: auth.roles, permissions: ["VIEW_RECLAMOS", "MANAGE_RECLAMOS"] }} />);
    expect(screen.getByText("Trabajos del agente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mis rutas" })).toBeInTheDocument();
    for (const name of ["Reclamos", "Planes", "Rutas", "Rutas generadas", "Metricas", "Usuarios", "Municipios", "Auditoria", "Exportar reporte"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("preserves administration for ADMIN even with AGENT role", () => {
    auth.roles = ["ADMIN", "AGENT"];
    render(<AdminDashboard user={{ userId: "admin-1", email: "admin@test.local", roles: auth.roles, permissions: [] }} />);
    expect(screen.getByText("Gestion general de reclamos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Planes" }));
    expect(screen.getByText("Planes administrativos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Metricas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Municipios" }));
    expect(screen.getByText("Panel de municipios")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Metricas" }));
    expect(screen.getByText("Metricas municipales")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Auditoria" }));
    expect(screen.getByText("Panel de auditoria")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mis rutas" })).not.toBeInTheDocument();
  });

  it("announces the actual mobile menu state", () => {
    render(<AdminDashboard user={{ userId: "agent-1", email: "agent@test.local", roles: auth.roles, permissions: [] }} />);
    const toggle = screen.getByRole("button", { name: "Abrir menu lateral" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("data-open", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Cerrar menu lateral" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mis rutas" }));
    expect(screen.getByRole("button", { name: "Abrir menu lateral" })).toHaveAttribute("aria-expanded", "false");
  });
});