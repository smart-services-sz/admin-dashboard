import { apiFetch } from "@/lib/api-client";
import type { ReclamoCategoria, ReclamoPrioridad } from "@/services/reclamos.service";

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
  savedPlanId: string | null;
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
  };
}

export interface RoutingAreaPlan {
  id: string;
  name: string;
  userId: string;
  userName?: string | null;
  categorias: string[];
  originLat: number;
  originLng: number;
  dailyByUser: number;
  dailyByCategory: number;
  createdAt: string;
  updatedAt: string;
}

class RoutingService {
  getRules(): Promise<RoutingRulesResponse> {
    return apiFetch<RoutingRulesResponse>(`${BASE}/rules`);
  }

  getAreaPlans(): Promise<{ status: string; data: RoutingAreaPlan[] }> {
    return apiFetch<{ status: string; data: RoutingAreaPlan[] }>(`${BASE}/area-plans`);
  }

  saveAreaPlan(payload: Omit<RoutingAreaPlan, "createdAt" | "updatedAt">): Promise<{ status: string; data: RoutingAreaPlan }> {
    return apiFetch<{ status: string; data: RoutingAreaPlan }>(`${BASE}/area-plans`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  deleteAreaPlan(id: string): Promise<{ status: string; message: string }> {
    return apiFetch<{ status: string; message: string }>(`${BASE}/area-plans/${id}`, {
      method: "DELETE",
    });
  }

  upsertRules(payload: UpsertRoutingRulesPayload): Promise<{ status: string; message: string }> {
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
    return apiFetch<{ status: string; message: string }>(`${BASE}/plans/${id}/confirm`, {
      method: "POST",
    });
  }
}

export const routingService = new RoutingService();
