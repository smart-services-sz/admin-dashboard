import { apiFetch } from '@/lib/api-client';

const BASE = '/api/municipalities/config';

export interface MunicipalityArea {
  slug: string;
  name: string;
  description?: string | null;
  isActive: boolean;
}

export interface MunicipalityCategory {
  code: string;
  name: string;
  description?: string | null;
  defaultPriority: 'alta' | 'media' | 'baja';
  isActive: boolean;
}

export interface MunicipalityNeighborhood {
  slug: string;
  name: string;
  areaSlug?: string | null;
  isActive: boolean;
}

export interface MunicipalityRule {
  key: string;
  value: Record<string, unknown>;
  description?: string | null;
  isActive: boolean;
}

export interface MunicipalityConfiguration {
  id: string;
  name: string;
  country: string;
  province?: string | null;
  defaultCity?: string | null;
  timezone: string;
  allowedCountries: string[];
  allowedAdminAreas: string[];
  isActive: boolean;
  areas: MunicipalityArea[];
  categories: MunicipalityCategory[];
  neighborhoods: MunicipalityNeighborhood[];
  rules: MunicipalityRule[];
}

class MunicipalConfigService {
  list(includeInactive = true): Promise<MunicipalityConfiguration[]> {
    return apiFetch<MunicipalityConfiguration[]>(
      `${BASE}?includeInactive=${includeInactive}`,
    );
  }

  save(
    payload: MunicipalityConfiguration,
  ): Promise<MunicipalityConfiguration> {
    return apiFetch<MunicipalityConfiguration>(BASE, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const municipalConfigService = new MunicipalConfigService();