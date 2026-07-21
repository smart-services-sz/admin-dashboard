import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoutingRoutesPanel } from "@/components/routing-routes-panel";

const mockGetAreaPlans = vi.fn();
const mockGetRules = vi.fn();
const mockGetPlans = vi.fn();
const mockSimulate = vi.fn();
const mockGenerate = vi.fn();
const mockUpsertRules = vi.fn();
const mockConfirmPlan = vi.fn();
const mockGetActiveUsersByRole = vi.fn();

vi.mock("@/services/access-control.service", () => ({
  accessControlService: {
    getActiveUsersByRole: (...args: unknown[]) => mockGetActiveUsersByRole(...args),
  },
}));

vi.mock("@/services/routing.service", () => ({
  routingService: {
    getAreaPlans: () => mockGetAreaPlans(),
    getRules: () => mockGetRules(),
    getPlans: () => mockGetPlans(),
    simulate: (...args: unknown[]) => mockSimulate(...args),
    generate: (...args: unknown[]) => mockGenerate(...args),
    upsertRules: (...args: unknown[]) => mockUpsertRules(...args),
    confirmPlan: (...args: unknown[]) => mockConfirmPlan(...args),
  },
}));

describe("RoutingRoutesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAreaPlans.mockResolvedValue({
      status: "ok",
      data: [
        {
          id: "plan-1",
          name: "Plan Aguas y Cloacas",
          userId: "agent-1",
          userName: "Agente Uno",
          categorias: ["Aguas y Cloacas"],
          originAddress: "Origen Test",
          originLat: -34.55,
          originLng: -58.45,
          dailyByUser: 10,
          dailyByCategory: 10,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    mockGetRules.mockResolvedValue({
      status: "ok",
      data: {
        categoryRules: [],
        crews: [],
        zones: [],
      },
    });

    mockGetPlans.mockResolvedValue({ status: "ok", data: [] });

    mockGetActiveUsersByRole.mockResolvedValue({
      status: "ok",
      data: [
        {
          id: "agent-1",
          name: "Agente Uno",
          email: "agente1@test.local",
          isActive: true,
        },
      ],
    });

    mockSimulate.mockResolvedValue({
      status: "ok",
      generatedAt: new Date().toISOString(),
      planningDate: new Date().toISOString(),
      summary: {
        totalFetched: 20,
        totalCandidateAfterRules: 12,
        totalAssigned: 8,
        totalUnassigned: 4,
        unassignedByReason: {},
        categoryQuotaConsumption: { agua_y_cloacas: 8 },
        googleOptimization: {
          enabled: false,
          optimizedRoutes: 0,
          failedRoutes: 0,
        },
      },
      routes: [
        {
          crewId: "agent-1",
          nombre: "Agente Uno",
          assignedClaims: 8,
          maxReclamosDiarios: 10,
          totalDistanceKm: 6.4,
          totalDurationMin: 31,
          stops: [],
        },
      ],
      unassigned: [],
      savedPlanId: null,
    });

    mockGenerate.mockResolvedValue({
      status: "ok",
      generatedAt: new Date().toISOString(),
      planningDate: new Date().toISOString(),
      summary: {
        totalFetched: 20,
        totalCandidateAfterRules: 12,
        totalAssigned: 8,
        totalUnassigned: 4,
        unassignedByReason: {},
        categoryQuotaConsumption: { agua_y_cloacas: 8 },
        googleOptimization: {
          enabled: true,
          optimizedRoutes: 1,
          failedRoutes: 0,
        },
      },
      routes: [
        {
          crewId: "agent-1",
          nombre: "Agente Uno",
          assignedClaims: 8,
          maxReclamosDiarios: 10,
          totalDistanceKm: 6.4,
          totalDurationMin: 31,
          stops: [],
        },
      ],
      unassigned: [],
      savedPlanId: "generated-plan-1",
    });
  });

  const goToStepTwo = async () => {
    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: "plan-1" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continuar al paso 2" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Continuar al paso 2" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cargar reclamos" })).toBeInTheDocument();
    });
  };

  it("permite cargar reclamos con categoria alias sin mostrar error de categorias", async () => {
    render(<RoutingRoutesPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continuar al paso 2" })).toBeInTheDocument();
    });

    await goToStepTwo();

    fireEvent.click(screen.getByRole("button", { name: "Cargar reclamos" }));

    await waitFor(() => {
      expect(screen.getByText("Reclamos cargados. Ya puedes generar la ruta optimizada.")).toBeInTheDocument();
    });

    expect(screen.queryByText("El plan seleccionado no tiene categorias configuradas para ruteo.")).not.toBeInTheDocument();

    expect(mockSimulate).toHaveBeenCalled();
    const simulatePayload = mockSimulate.mock.calls[0][0];
    expect(simulatePayload.overrideRules.categoryRules[0].categoria).toBe("agua_y_cloacas");
  });

  it("muestra sugerencias por causa cuando hay no asignados", async () => {
    mockSimulate.mockResolvedValueOnce({
      status: "ok",
      generatedAt: new Date().toISOString(),
      planningDate: new Date().toISOString(),
      summary: {
        totalFetched: 20,
        totalCandidateAfterRules: 12,
        totalAssigned: 8,
        totalUnassigned: 4,
        unassignedByReason: {
          "cupo diario agotado": 3,
        },
        categoryQuotaConsumption: { agua_y_cloacas: 8 },
        googleOptimization: {
          enabled: false,
          optimizedRoutes: 0,
          failedRoutes: 0,
        },
      },
      routes: [
        {
          crewId: "agent-1",
          nombre: "Agente Uno",
          assignedClaims: 8,
          maxReclamosDiarios: 10,
          totalDistanceKm: 6.4,
          totalDurationMin: 31,
          stops: [],
        },
      ],
      unassigned: [],
      savedPlanId: null,
    });

    render(<RoutingRoutesPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continuar al paso 2" })).toBeInTheDocument();
    });

    await goToStepTwo();

    fireEvent.click(screen.getByRole("button", { name: "Cargar reclamos" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Volver al paso 2" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Volver al paso 2" }));

    await waitFor(() => {
      expect(screen.getByText("No asignados por causa (Paso 2)")).toBeInTheDocument();
    });

    expect(screen.getByText("cupo diario agotado")).toBeInTheDocument();
    expect(screen.getByText("Aumenta cupos por categoria o por usuario para esta corrida.")).toBeInTheDocument();
  });

  it("aplica fallback sin Google cuando falla la optimizacion de Google", async () => {
    mockGenerate.mockImplementation((payload: { useGoogleOptimization: boolean }) => {
      if (payload.useGoogleOptimization) {
        return Promise.reject(new Error("Google optimization failed"));
      }

      return Promise.resolve({
        status: "ok",
        generatedAt: new Date().toISOString(),
        planningDate: new Date().toISOString(),
        summary: {
          totalFetched: 20,
          totalCandidateAfterRules: 12,
          totalAssigned: 8,
          totalUnassigned: 4,
          unassignedByReason: {},
          categoryQuotaConsumption: { agua_y_cloacas: 8 },
          googleOptimization: {
            enabled: false,
            optimizedRoutes: 0,
            failedRoutes: 0,
          },
        },
        routes: [
          {
            crewId: "agent-1",
            nombre: "Agente Uno",
            assignedClaims: 8,
            maxReclamosDiarios: 10,
            totalDistanceKm: 6.4,
            totalDurationMin: 31,
            stops: [],
          },
        ],
        unassigned: [],
        savedPlanId: "generated-plan-fallback",
      });
    });

    render(<RoutingRoutesPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continuar al paso 2" })).toBeInTheDocument();
    });

    await goToStepTwo();

    fireEvent.click(screen.getByRole("button", { name: "Cargar reclamos" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generar ruta optimizada" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generar ruta optimizada" }));

    await waitFor(() => {
      expect(screen.getByText("Ruta generada con fallback sin Google por un problema transitorio en optimizacion.")).toBeInTheDocument();
    });

    const calls = mockGenerate.mock.calls.map((args) => args[0]);
    expect(calls.some((payload: { useGoogleOptimization: boolean }) => payload.useGoogleOptimization)).toBe(true);
    expect(calls.some((payload: { useGoogleOptimization: boolean }) => !payload.useGoogleOptimization)).toBe(true);
  });
});
