import { describe, expect, it, vi } from 'vitest';
import { metricsService, metricsUrl } from './metrics.service';

describe('metricsUrl', () => {
  it('serializes only one municipality and its selected dimensions', () => {
    const url = new URL(metricsUrl({
      municipalityId: 'funes', areaId: 'centro', from: '2026-10-01', to: '2026-10-16',
      estado: 'resuelto', categoria: 'alumbrado', prioridad: 'alta', canal: 'web', bucketDays: 7,
    }), 'http://localhost');
    expect(url.pathname).toBe('/api/reclamos/metrics');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      municipalityId: 'funes', areaId: 'centro', from: '2026-10-01', to: '2026-10-16',
      estado: 'resuelto', categoria: 'alumbrado', prioridad: 'alta', canal: 'web', bucketDays: '7',
    });
    expect(url.searchParams.has('municipalityId')).toBe(true);
  });

  it('queries routing metrics with the same municipality and range', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await metricsService.getRoutingMetrics({ municipalityId: 'funes', from: '2026-10-01', to: '2026-10-16', bucketDays: 7 });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/routing/metrics?municipalityId=funes&from=2026-10-01&to=2026-10-16&bucketDays=7',
        expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});