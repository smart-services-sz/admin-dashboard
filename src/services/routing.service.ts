import { apiFetch } from "@/lib/api-client";
import type {
  ReclamoCategoria,
  ReclamoEstado,
  ReclamoPrioridad,
} from "@/services/reclamos.service";

const BASE = "/api/routing";

export interface RoutingCategoryRule {
  categoria: ReclamoCategoria;
  cupoDiario: number;
  pesoPrioridad?: number;
}

export interface RoutingCrewRule {
  crewId: string;
  userId?: string;
  nombre?: string;
  userName?: string;
  maxReclamosDiarios: number;
  allowedCategorias: ReclamoCategoria[];
  allowedZoneIds?: string[];
  startLat?: number;
  startLng?: number;
}

export interface RoutingZoneRule {
  id: string;
  nombre?: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface UpsertRoutingRulesPayload {
  categoryRules: RoutingCategoryRule[];
  crews: RoutingCrewRule[];
  zones?: RoutingZoneRule[];
}

export interface SimulateRoutingPayload {
  planningDate?: string;
  maxFetch?: number;
  claimStatuses?: ReclamoEstado[];
  priorities?: ReclamoPrioridad[];
  categories?: ReclamoCategoria[];
  municipalityId?: string;
  areaId?: string;
  persistPlan?: boolean;
  useGoogleOptimization?: boolean;
  originLat?: number;
  originLng?: number;
  overrideRules?: UpsertRoutingRulesPayload;
}

export interface RoutingStop {
  sequence: number;
  reclamoId: string;
  categoria: ReclamoCategoria;
  prioridad: ReclamoPrioridad;
  zoneId: string | null;
  lat: number;
  lng: number;
  direccion: string;
  distanceFromPreviousKm: number;
  durationFromPreviousMin: number;
  createdAt: string;
}

export interface RoutingRouteResult {
  crewId: string;
  nombre: string;
  assignedClaims: number;
  maxReclamosDiarios: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  stops: RoutingStop[];
}

export type InterventionResult = "resuelto" | "no_resuelto" | "requiere_nueva_visita" | "no_corresponde";

export interface RouteEvidence {
  id: string;
  tipo: "imagen" | "video" | "documento";
  nombreArchivo: string;
  urlArchivo: string;
  descripcion?: string | null;
  createdAt: string;
}

export interface AssignedRoute {
  id: string;
  nombre: string;
  crewId: string;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  startedAt: string | null;
  completedAt: string | null;
  totalDistanceKm: number;
  totalDurationMin: number;
  plan: { id: string; planningDate: string; status: string };
  stops: Array<RoutingStop & {
    id: string;
    status: string;
    intervention: {
      id?: string;
      result: InterventionResult;
      observation: string | null;
      evidences?: RouteEvidence[];
    } | null;
  }>;
}

export interface RoutingSimulationResult {
  status: string;
  generatedAt: string;
  planningDate: string;
  summary: {
    totalFetched: number;
    totalCandidateAfterRules: number;
    totalAssigned: number;
    totalUnassigned: number;
    unassignedByReason: Record<string, number>;
    categoryQuotaConsumption: Record<string, number>;
    googleOptimization: {
      enabled: boolean;
      optimizedRoutes: number;
      failedRoutes: number;
    };
  };
  routes: RoutingRouteResult[];
  unassigned: Array<{ reclamoId: string; reason: string }>;
  actionHistory?: RoutingActionHistory[];
  savedPlanId: string | null;
}

export interface RoutingActionHistory {
  id: string;
  action: string;
  planId?: string | null;
  routeId?: string | null;
  stopId?: string | null;
  interventionId?: string | null;
  evidenceId?: string | null;
  reclamoId?: string | null;
  actorId?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface RoutingRulesResponse {
  status: string;
  data: {
    categoryRules: RoutingCategoryRule[];
    crews: RoutingCrewRule[];
    zones: RoutingZoneRule[];
  };
}

export interface RoutingPlanResponse {
  status: string;
  data: {
    id: string;
    planningDate: string;
    status: "proposed" | "confirmed" | "cancelled";
    summary: Record<string, unknown>;
    routes: Array<{
      id: string;
      crewId: string;
      nombre: string;
      assignedClaims: number;
      maxReclamosDiarios: number;
      totalDistanceKm: number;
      totalDurationMin: number;
      stops: Array<{
        id: string;
        sequence: number;
        reclamoId: string;
        categoria: ReclamoCategoria;
        prioridad: ReclamoPrioridad;
        zoneId: string | null;
        lat: number;
        lng: number;
        direccion: string;
        distanceFromPreviousKm: number;
        durationFromPreviousMin: number;
        createdAt: string;
      }>;
    }>;
    unassigned: Array<{ id: string; reclamoId: string; reason: string }>;
    actionHistory: RoutingActionHistory[];
  };
}

export interface RoutingAreaPlan {
  id: string;
  name: string;
  userId: string;
  userName?: string | null;
  categorias: string[];
  originAddress?: string | null;
  originLat: number;
  originLng: number;
  dailyByUser: number;
  dailyByCategory: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoutingPlanListItem {
  id: string;
  planningDate: string;
  status: "proposed" | "confirmed" | "cancelled" | string;
  createdAt: string;
  updatedAt: string;
  totalRoutes: number;
  totalUnassigned: number;
  totalAssigned: number;
  routes: Array<{
    crewId: string;
    nombre: string;
    assignedClaims: number;
  }>;
}

class RoutingService {
  getAssignedRoutes(): Promise<{ status: string; data: AssignedRoute[] }> {
    return apiFetch(`${BASE}/assigned-routes`);
  }

  startRoute(routeId: string): Promise<{ status: string; message: string }> {
    return apiFetch(`${BASE}/routes/status`, {
      method: "PUT",
      body: JSON.stringify({ routeId, status: "in_progress" }),
    });
  }

  registerIntervention(payload: {
    routeId: string;
    stopId: string;
    result: InterventionResult;
    observation?: string;
  }): Promise<{ status: string; message: string }> {
    return apiFetch(`${BASE}/interventions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  attachInterventionEvidence(payload: {
    interventionId: string;
    file: File;
    descripcion?: string;
  }): Promise<{ status: string; data: RouteEvidence }> {
    const formData = new FormData();
    formData.append("interventionId", payload.interventionId);
    formData.append("evidencia", payload.file);
    if (payload.descripcion) formData.append("descripcion", payload.descripcion);
    return apiFetch(`${BASE}/interventions/evidence`, {
      method: "POST",
      body: formData,
    });
  }

  getRules(): Promise<RoutingRulesResponse> {
    return apiFetch<RoutingRulesResponse>(`${BASE}/rules`);
  }

  getAreaPlans(): Promise<{ status: string; data: RoutingAreaPlan[] }> {
    return apiFetch<{ status: string; data: RoutingAreaPlan[] }>(
      `${BASE}/area-plans`,
    );
  }

  getPlans(): Promise<{ status: string; data: RoutingPlanListItem[] }> {
    return apiFetch<{ status: string; data: RoutingPlanListItem[] }>(
      `${BASE}/plans`,
    );
  }

  saveAreaPlan(
    payload: Omit<RoutingAreaPlan, "createdAt" | "updatedAt" | "id"> & {
      id?: string;
    },
  ): Promise<{ status: string; data: RoutingAreaPlan }> {
    return apiFetch<{ status: string; data: RoutingAreaPlan }>(
      `${BASE}/area-plans`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  deleteAreaPlan(id: string): Promise<{ status: string; message: string }> {
    return apiFetch<{ status: string; message: string }>(
      `${BASE}/area-plans/${id}`,
      {
        method: "DELETE",
      },
    );
  }

  upsertRules(
    payload: UpsertRoutingRulesPayload,
  ): Promise<{ status: string; message: string }> {
    return apiFetch<{ status: string; message: string }>(`${BASE}/rules`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  simulate(payload: SimulateRoutingPayload): Promise<RoutingSimulationResult> {
    return apiFetch<RoutingSimulationResult>(`${BASE}/simulate`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  generate(payload: SimulateRoutingPayload): Promise<RoutingSimulationResult> {
    return apiFetch<RoutingSimulationResult>(`${BASE}/generate`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  getPlan(id: string): Promise<RoutingPlanResponse> {
    return apiFetch<RoutingPlanResponse>(`${BASE}/plans/${id}`);
  }

  confirmPlan(id: string): Promise<{ status: string; message: string }> {
    return apiFetch<{ status: string; message: string }>(
      `${BASE}/plans/${id}/confirm`,
      {
        method: "POST",
      },
    );
  }

  deletePlan(id: string): Promise<{ status: string; message: string }> {
    return apiFetch<{ status: string; message: string }>(
      `${BASE}/plans/${id}`,
      {
        method: "DELETE",
      },
    );
  }
}

export const routingService = new RoutingService();
