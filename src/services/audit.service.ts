import { apiFetch } from '@/lib/api-client';

export type AuditLevel = 'INFO' | 'WARNING' | 'ERROR' | 'SECURITY';

export interface AuditLogEntry {
  id: string;
  eventId?: string | null;
  service: string;
  action: string;
  entity: string;
  entityId?: string | null;
  performedBy?: string | null;
  municipalityId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  level: AuditLevel;
  createdAt: string;
}

export interface AuditLogFilters {
  service?: string;
  performedBy?: string;
  action?: string;
  level?: AuditLevel | '';
  entity?: string;
  entityId?: string;
  municipalityId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogsResponse {
  data: AuditLogEntry[];
  meta: {
    totalItems: number;
    itemsPerPage: number;
    currentPage: number;
    totalPages: number;
  };
}

export function auditLogsUrl(filters: AuditLogFilters = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      query.set(key, String(value).trim());
    }
  }
  const suffix = query.toString();
  return `/api/audit/logs${suffix ? `?${suffix}` : ''}`;
}

class AuditService {
  list(filters: AuditLogFilters) {
    return apiFetch<AuditLogsResponse>(auditLogsUrl(filters), { cache: 'no-store' });
  }
}

export const auditService = new AuditService();