import { apiFetch } from "@/lib/api-client";

const BASE = "/api/reclamos";

export type ReclamoEstado =
  | "pendiente"
  | "en_proceso"
  | "resuelto"
  | "rechazado"
  | "cerrado";

export type ReclamoCategoria =
  | "agua_y_cloacas"
  | "alumbrado"
  | "baches_y_pavimento"
  | "arbolado"
  | "residuos"
  | "electricidad"
  | "gas"
  | "transporte"
  | "infraestructura"
  | "otros";

export type ReclamoPrioridad = "alta" | "media" | "baja";

export type Canal =
  | "whatsapp"
  | "web"
  | "email"
  | "instagram"
  | "facebook"
  | "manual"
  | "other";

export interface Reclamo {
  id: string;
  codigoSeguimiento: string;
  correlationId: string;
  contactKey: string;
  canal: Canal;
  correo?: string | null;
  dni?: string | null;
  problema: string;
  direccion: string;
  lat: number;
  lng: number;
  categoria: ReclamoCategoria;
  prioridad: ReclamoPrioridad;
  estado: ReclamoEstado;
  observaciones?: string | null;
  creadoEn: string;
  actualizadoEn: string;
  resolvedAt?: string | null;
}

export interface ReclamoListResponse {
  items: Reclamo[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface FindReclamosParams {
  page?: number;
  limit?: number;
  estado?: ReclamoEstado;
  categoria?: ReclamoCategoria;
  prioridad?: ReclamoPrioridad;
  contactKey?: string;
  codigoSeguimiento?: string;
}

export interface UpdateReclamoPayload {
  estado?: ReclamoEstado;
  prioridad?: ReclamoPrioridad;
  observaciones?: string;
  problema?: string;
  direccion?: string;
}

class ReclamosService {
  getReclamos(params: FindReclamosParams = {}): Promise<ReclamoListResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.estado) query.set("estado", params.estado);
    if (params.categoria) query.set("categoria", params.categoria);
    if (params.prioridad) query.set("prioridad", params.prioridad);
    if (params.contactKey) query.set("contactKey", params.contactKey);
    if (params.codigoSeguimiento) query.set("codigoSeguimiento", params.codigoSeguimiento);
    const qs = query.toString();
    return apiFetch<ReclamoListResponse>(`${BASE}${qs ? `?${qs}` : ""}`);
  }

  getReclamoById(id: string): Promise<Reclamo> {
    return apiFetch<Reclamo>(`${BASE}/${id}`);
  }

  updateReclamo(id: string, payload: UpdateReclamoPayload): Promise<Reclamo> {
    return apiFetch<Reclamo>(`${BASE}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  deleteReclamo(id: string): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(`${BASE}/${id}`, {
      method: "DELETE",
    });
  }
}

export const reclamosService = new ReclamosService();

export const ESTADO_LABELS: Record<ReclamoEstado, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
  rechazado: "Rechazado",
  cerrado: "Cerrado",
};

export const CATEGORIA_LABELS: Record<ReclamoCategoria, string> = {
  agua_y_cloacas: "Agua y cloacas",
  alumbrado: "Alumbrado",
  baches_y_pavimento: "Baches y pavimento",
  arbolado: "Arbolado",
  residuos: "Residuos",
  electricidad: "Electricidad",
  gas: "Gas",
  transporte: "Transporte",
  infraestructura: "Infraestructura",
  otros: "Otros",
};

export const PRIORIDAD_LABELS: Record<ReclamoPrioridad, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};
