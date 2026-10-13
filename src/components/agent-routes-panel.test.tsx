import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AgentRoutesPanel } from "./agent-routes-panel";

const { getAssignedRoutes, startRoute, registerIntervention } = vi.hoisted(() => ({
  getAssignedRoutes: vi.fn(), startRoute: vi.fn(), registerIntervention: vi.fn(),
}));

vi.mock("@/services/routing.service", () => ({ routingService: { getAssignedRoutes, startRoute, registerIntervention } }));

function assignedRoute(status = "assigned") {
  return {
    id: "route-1", nombre: "Ruta Centro", status, totalDistanceKm: 2,
    plan: { planningDate: "2026-10-13T00:00:00Z" },
    stops: [
      { id: "stop-2", sequence: 2, direccion: "Calle Dos", categoria: "residuos", prioridad: "media", reclamoId: "claim-2", lat: -34.61, lng: -58.38, status: "pendiente", intervention: null },
      { id: "stop-1", sequence: 1, direccion: "Calle Uno", categoria: "agua_y_cloacas", prioridad: "alta", reclamoId: "claim-1", lat: -34.60, lng: -58.39, status: "pendiente", intervention: null },
    ],
  };
}

describe("AgentRoutesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAssignedRoutes.mockResolvedValue({ data: [assignedRoute()] });
    startRoute.mockResolvedValue({ status: "ok" });
    registerIntervention.mockResolvedValue({ status: "ok" });
  });

  it("requires starting the route before registering work", async () => {
    render(<AgentRoutesPanel />);
    await screen.findByRole("button", { name: "Comenzar ruta" });
    expect(screen.queryByRole("button", { name: "Cerrar trabajo" })).not.toBeInTheDocument();
    getAssignedRoutes.mockResolvedValue({ data: [assignedRoute("in_progress")] });
    fireEvent.click(screen.getByRole("button", { name: "Comenzar ruta" }));
    await screen.findByRole("button", { name: "Cerrar trabajo" });
    expect(startRoute).toHaveBeenCalledWith("route-1");
  });

  it("registers only the first pending stop in sequence order", async () => {
    getAssignedRoutes.mockResolvedValue({ data: [assignedRoute("in_progress")] });
    render(<AgentRoutesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar trabajo" }));
    await waitFor(() => expect(registerIntervention).toHaveBeenCalledWith({ routeId: "route-1", stopId: "stop-1", result: "resuelto", observation: undefined }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Calle Uno");
  });

  it("distinguishes no assignment from request failures", async () => {
    getAssignedRoutes.mockResolvedValue({ data: [] });
    render(<AgentRoutesPanel />);
    expect(await screen.findByText("No tienes rutas asignadas.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows request failures without claiming there are no assigned routes", async () => {
    getAssignedRoutes.mockRejectedValue(new Error("Sin conexion"));
    render(<AgentRoutesPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexion");
    expect(screen.queryByText("No tienes rutas asignadas.")).not.toBeInTheDocument();
  });

  it("advances to the next stop and preserves the completed route", async () => {
    const route = assignedRoute("in_progress");
    getAssignedRoutes.mockResolvedValue({ data: [route] });
    render(<AgentRoutesPanel />);
    const nextRoute = {
      ...route,
      stops: route.stops.map((stop) => stop.id === "stop-1" ? { ...stop, status: "resuelto", intervention: { result: "resuelto", observation: null } } : stop),
    };
    getAssignedRoutes.mockResolvedValue({ data: [nextRoute] });
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar trabajo" }));
    await screen.findByText("1 de 2 trabajos registrados · 2.0 km");
    getAssignedRoutes.mockResolvedValue({ data: [{
      ...nextRoute,
      status: "completed",
      stops: nextRoute.stops.map((stop) => ({ ...stop, status: "resuelto", intervention: { result: "resuelto", observation: null } })),
    }] });
    fireEvent.change(screen.getByLabelText("Observaciones"), { target: { value: "  Trabajo terminado  " } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar trabajo" }));
    await screen.findByText("Ruta completada. Todos los trabajos fueron registrados.");
    expect(registerIntervention).toHaveBeenLastCalledWith({ routeId: "route-1", stopId: "stop-2", result: "resuelto", observation: "Trabajo terminado" });
    await screen.findByText("Completada", { selector: "span" });
    expect(screen.queryByRole("button", { name: "Cerrar trabajo" })).not.toBeInTheDocument();
  });

  it("allows selecting another assigned route", async () => {
    getAssignedRoutes.mockResolvedValue({ data: [assignedRoute(), { ...assignedRoute(), id: "route-2", nombre: "Ruta Norte" }] });
    render(<AgentRoutesPanel />);
    fireEvent.change(await screen.findByLabelText("Ruta asignada"), { target: { value: "route-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Comenzar ruta" }));
    await waitFor(() => expect(startRoute).toHaveBeenCalledWith("route-2"));
  });

  it("keeps the current stop when registration fails", async () => {
    getAssignedRoutes.mockResolvedValue({ data: [assignedRoute("in_progress")] });
    registerIntervention.mockRejectedValueOnce(new Error("No se pudo guardar"));
    render(<AgentRoutesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar trabajo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar");
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("data-current", "true");
  });

  it("exposes accessible progress, current step and readable categories", async () => {
    getAssignedRoutes.mockResolvedValue({ data: [assignedRoute("in_progress")] });
    render(<AgentRoutesPanel />);
    expect(await screen.findByRole("progressbar", { name: "Avance de la ruta" })).toHaveAttribute("max", "2");
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getAllByText("Agua y cloacas")).toHaveLength(2);
    expect(screen.getByText("Prioridad Alta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar rutas" })).toHaveAttribute("title", "Actualizar rutas");
    expect(screen.getByRole("textbox", { name: "Observaciones" })).toHaveAttribute("aria-describedby", "observation-count");
  });

  it("keeps the workspace visible while refreshing", async () => {
    render(<AgentRoutesPanel />);
    await screen.findByRole("button", { name: "Comenzar ruta" });
    let resolveRefresh: (response: { data: ReturnType<typeof assignedRoute>[] }) => void = () => {};
    getAssignedRoutes.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar rutas" }));
    expect(screen.getByRole("region", { name: "Resumen de ruta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comenzar ruta" })).toBeDisabled();
    resolveRefresh({ data: [assignedRoute()] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Comenzar ruta" })).toBeEnabled());
  });
});