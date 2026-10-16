import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ReclamosMetricsPanel } from './reclamos-metrics-panel';

const services = vi.hoisted(() => ({
  listMunicipalities: vi.fn(),
  getMetrics: vi.fn(),
  getRoutingMetrics: vi.fn(),
}));

vi.mock('@/services/municipal-config.service', () => ({
  municipalConfigService: { list: services.listMunicipalities },
}));
vi.mock('@/services/metrics.service', () => ({
  metricsService: { getReclamoMetrics: services.getMetrics, getRoutingMetrics: services.getRoutingMetrics },
}));

const municipality = (id: string, name: string) => ({
  id, name, country: 'Argentina', province: 'Santa Fe', defaultCity: name,
  timezone: 'America/Argentina/Buenos_Aires', allowedCountries: ['Argentina'],
  allowedAdminAreas: ['Santa Fe'], isActive: true,
  areas: [{ slug: 'centro', name: 'Centro', isActive: true }],
  categories: [{ code: 'alumbrado', name: 'Alumbrado', isActive: true, defaultPriority: 'media' as const }],
  neighborhoods: [], rules: [],
});

const metrics = {
  municipalityId: 'funes',
  range: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-16T23:59:59.999Z', bucketDays: 1 },
  summary: { total: 12, previousTotal: 8, changePercent: 50, open: 5, resolved: 7, closed: 0, rejected: 0, resolutionRate: 58.3, averageResolutionHours: 4.5, medianResolutionHours: 3.25 },
  byStatus: [{ name: 'pendiente', total: 5 }, { name: 'resuelto', total: 7 }],
  byCategory: [{ name: 'alumbrado', total: 12 }],
  byPriority: [{ name: 'alta', total: 4 }],
  byChannel: [{ name: 'web', total: 12 }],
  byArea: [{ name: 'centro', total: 12 }],
  timeline: [{ period: '2026-10-15T00:00:00.000Z', total: 12 }],
};

const routingMetrics = {
  municipalityId: 'funes',
  range: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-16T23:59:59.999Z', bucketDays: 1 },
  summary: {
    totalPlans: 2, proposedPlans: 1, confirmedPlans: 1, totalRoutes: 3, assignedRoutes: 2,
    inProgressRoutes: 1, completedRoutes: 1, routeCompletionRate: 33.3, assignedClaims: 8,
    unassignedClaims: 1, totalStops: 12, pendingStops: 4, completedStops: 8,
    stopCompletionRate: 66.7, interventions: 5, evidences: 3, totalDistanceKm: 24.5,
    totalDurationMin: 180,
  },
  byPlanStatus: [{ name: 'confirmed', total: 1 }],
  byRouteStatus: [{ name: 'completed', total: 1 }],
  byStopStatus: [{ name: 'visitado', total: 8 }],
  byStopCategory: [{ name: 'alumbrado', total: 5 }],
  byInterventionResult: [{ name: 'resuelto', total: 4 }],
  unassignedByReason: [{ name: 'no_eligible_crew', total: 1 }],
  timeline: [{ period: '2026-10-15T00:00:00.000Z', plans: 2 }],
};

describe('ReclamosMetricsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.listMunicipalities.mockResolvedValue([municipality('funes', 'Funes'), municipality('rosario', 'Rosario')]);
    services.getMetrics.mockResolvedValue(metrics);
    services.getRoutingMetrics.mockResolvedValue(routingMetrics);
  });

  it('locks metrics to the municipality in the authenticated user context', async () => {
    render(<ReclamosMetricsPanel user={{ userId: 'admin-funes', email: 'admin@funes.test', roles: ['ADMIN'], permissions: [], municipalityId: 'funes' }} />);
    expect(await screen.findByText('Reclamos recibidos')).toBeInTheDocument();
    await waitFor(() => expect(services.getMetrics).toHaveBeenCalledWith(expect.objectContaining({ municipalityId: 'funes' })));
    await waitFor(() => expect(services.getRoutingMetrics).toHaveBeenCalledWith(expect.objectContaining({ municipalityId: 'funes' })));
    expect(screen.getByLabelText('Municipio')).toHaveValue('Funes · funes');
    expect(screen.getByLabelText('Área')).toHaveValue('');
    expect(screen.getAllByText('Alumbrado')).toHaveLength(3);
    expect(screen.getAllByText('12', { selector: 'strong' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Ruteo municipal' })).toBeInTheDocument();
    expect(screen.getByText('24,5 km')).toBeInTheDocument();
    expect(screen.getByText(/No se segmenta por área/)).toBeInTheDocument();
  });

  it('requires a platform admin to select one municipality and never requests mixed totals', async () => {
    render(<ReclamosMetricsPanel user={{ userId: 'platform-admin', email: 'platform@test.local', roles: ['ADMIN'], permissions: [] }} />);
    const selector = await screen.findByLabelText('Municipio');
    expect(services.getMetrics).not.toHaveBeenCalled();
    fireEvent.change(selector, { target: { value: 'funes' } });
    await waitFor(() => expect(services.getMetrics).toHaveBeenCalledWith(expect.objectContaining({ municipalityId: 'funes' })));
    await waitFor(() => expect(services.getRoutingMetrics).toHaveBeenCalledWith(expect.objectContaining({ municipalityId: 'funes' })));
    expect(screen.queryByText('Selecciona un municipio para ver sus datos. Nunca se combinan municipios en esta vista.')).not.toBeInTheDocument();
  });

  it('applies area, date, status, category, priority and channel filters to one municipality', async () => {
    render(<ReclamosMetricsPanel user={{ userId: 'admin-platform', email: 'platform@test.local', roles: ['ADMIN'], permissions: [] }} />);
    fireEvent.change(await screen.findByLabelText('Municipio'), { target: { value: 'funes' } });
    await screen.findByText('Reclamos recibidos');
    fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'centro' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-16' } });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'resuelto' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'alumbrado' } });
    fireEvent.change(screen.getByLabelText('Prioridad'), { target: { value: 'alta' } });
    fireEvent.change(screen.getByLabelText('Canal'), { target: { value: 'web' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(services.getMetrics).toHaveBeenLastCalledWith(expect.objectContaining({
      municipalityId: 'funes', areaId: 'centro', from: '2026-10-01', to: '2026-10-16',
      estado: 'resuelto', categoria: 'alumbrado', prioridad: 'alta', canal: 'web',
    })));
    expect(services.getRoutingMetrics).toHaveBeenLastCalledWith(expect.objectContaining({ municipalityId: 'funes', from: '2026-10-01', to: '2026-10-16', bucketDays: 1 }));
  });
});