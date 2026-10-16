import { describe, expect, it } from 'vitest';
import { auditLogsUrl } from './audit.service';

describe('auditLogsUrl', () => {
  it('encodes active filters and skips blank values', () => {
    expect(auditLogsUrl({
      service: 'ms-auth', action: 'USER_UPDATED', level: 'WARNING',
      municipalityId: 'funes', correlationId: 'corr-1', from: '2026-10-15',
      to: '', page: 2, limit: 50,
    })).toBe('/api/audit/logs?service=ms-auth&action=USER_UPDATED&level=WARNING&municipalityId=funes&correlationId=corr-1&from=2026-10-15&page=2&limit=50');
  });

  it('uses a plain paginated path when no filters are selected', () => {
    expect(auditLogsUrl({})).toBe('/api/audit/logs');
  });
});