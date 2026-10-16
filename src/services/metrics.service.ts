import { apiFetch } from '@/lib/api-client';

export type MetricsStatus = 'pendiente' | 'en_proceso' | 'resuelto' | 'rechazado' | 'cerrado';
export type MetricsPriority = 'alta' | 'media' | 'baja';
export type MetricsChannel = 'whatsapp' | 'web' | 'email' | 'instagram' | 'facebook' | 'manual' | 'other';

export interface ReclamoMetricsFilters {
  municipalityId?: string;
  areaId?: string;
  from: string;
  to: string;
  estado?: MetricsStatus | '';
  categoria?: string;
  prioridad?: MetricsPriority | '';
  canal?: MetricsChannel | '';
  bucketDays: 1 | 7 | 30;
}

export interface MetricsCount {
  name: string;
  total: number;
}

export interface ReclamoMetrics {
  municipalityId: string;
  range: { from: string; to: string; bucketDays: number };
  summary: {
    total: number;
    previousTotal: number;
    changePercent: number | null;
    open: number;
    resolved: number;
    closed: number;
    rejected: number;
    resolutionRate: number;
    averageResolutionHours: number | null;
    medianResolutionHours: number | null;
  };
  byStatus: MetricsCount[];
  byCategory: MetricsCount[];
  byPriority: MetricsCount[];
  byChannel: MetricsCount[];
  byArea: MetricsCount[];
  timeline: Array<{ period: string; total: number }>;
}

export interface RoutingMetrics {
  municipalityId: string;
  range: { from: string; to: string; bucketDays: number };
  summary: {
    totalPlans: number;
    proposedPlans: number;
    confirmedPlans: number;
    totalRoutes: number;
    assignedRoutes: number;
    inProgressRoutes: number;
    completedRoutes: number;
    routeCompletionRate: number;
    assignedClaims: number;
    unassignedClaims: number;
    totalStops: number;
    pendingStops: number;
    completedStops: number;
    stopCompletionRate: number;
    interventions: number;
    evidences: number;
    totalDistanceKm: number;
    totalDurationMin: number;
  };
  byPlanStatus: MetricsCount[];
  byRouteStatus: MetricsCount[];
  byStopStatus: MetricsCount[];
  byStopCategory: MetricsCount[];
  byInterventionResult: MetricsCount[];
  unassignedByReason: MetricsCount[];
  timeline: Array<{ period: string; plans: number }>;
}

export function metricsUrl(filters: ReclamoMetricsFilters): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      query.set(key, String(value).trim());
    }
  }
  return `/api/reclamos/metrics?${query.toString()}`;
}

export const metricsService = {
  getReclamoMetrics(filters: ReclamoMetricsFilters) {
    return apiFetch<ReclamoMetrics>(metricsUrl(filters), { cache: 'no-store' });
  },
  getRoutingMetrics(filters: Pick<ReclamoMetricsFilters, 'municipalityId' | 'from' | 'to' | 'bucketDays'>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && String(value).trim()) query.set(key, String(value).trim());
    }
    return apiFetch<RoutingMetrics>(`/api/routing/metrics?${query.toString()}`, { cache: 'no-store' });
  },
};