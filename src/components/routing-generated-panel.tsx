"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  routingService,
  type RoutingPlanListItem,
  type RoutingPlanResponse,
  type RoutingSimulationResult,
} from "@/services/routing.service";
import styles from "./routing-panel.module.css";

let googleMapsScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  const windowWithGoogle = window as Window & {
    google?: {
      maps?: {
        Map: new (...args: unknown[]) => unknown;
        Marker: new (...args: unknown[]) => unknown;
        Polyline: new (...args: unknown[]) => unknown;
        LatLngBounds: new (...args: unknown[]) => {
          extend: (point: { lat: number; lng: number }) => void;
        };
      };
    };
  };

  if (windowWithGoogle.google?.maps) {
    return Promise.resolve();
  }

  if (googleMapsScriptPromise) {
    return googleMapsScriptPromise;
  }

  googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("google-maps-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

function mapPlanToSimulation(plan: RoutingPlanResponse["data"]): RoutingSimulationResult {
  return {
    status: "ok",
    generatedAt: plan.planningDate,
    planningDate: plan.planningDate,
    summary: {
      totalFetched: Number((plan.summary.totalFetched as number | undefined) ?? 0),
      totalCandidateAfterRules: Number((plan.summary.totalCandidateAfterRules as number | undefined) ?? 0),
      totalAssigned: plan.routes.reduce((acc, route) => acc + route.assignedClaims, 0),
      totalUnassigned: plan.unassigned.length,
      unassignedByReason: (plan.summary.unassignedByReason as Record<string, number> | undefined) ?? {},
      categoryQuotaConsumption: (plan.summary.categoryQuotaConsumption as Record<string, number> | undefined) ?? {},
      googleOptimization:
        (plan.summary.googleOptimization as {
          enabled: boolean;
          optimizedRoutes: number;
          failedRoutes: number;
        } | undefined) ?? {
          enabled: false,
          optimizedRoutes: 0,
          failedRoutes: 0,
        },
    },
    routes: plan.routes,
    unassigned: plan.unassigned.map((item) => ({ reclamoId: item.reclamoId, reason: item.reason })),
    savedPlanId: plan.id,
  };
}

export function RoutingGeneratedPanel() {
  const [plans, setPlans] = useState<RoutingPlanListItem[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<RoutingSimulationResult | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAssigned, setMinAssigned] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const selectedRoute = useMemo(() => {
    if (!selectedPlan?.routes?.length) return null;
    if (!selectedCrewId) return selectedPlan.routes[0];
    return selectedPlan.routes.find((route) => route.crewId === selectedCrewId) ?? selectedPlan.routes[0];
  }, [selectedPlan, selectedCrewId]);

  const visibleStops = useMemo(() => selectedRoute?.stops ?? [], [selectedRoute]);

  const mapStops = useMemo(() => {
    return visibleStops.filter(
      (stop) =>
        Number.isFinite(stop.lat) &&
        Number.isFinite(stop.lng) &&
        Math.abs(stop.lat) <= 90 &&
        Math.abs(stop.lng) <= 180,
    );
  }, [visibleStops]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapStops.length === 0 || !googleMapsKey) {
      return;
    }

    let cancelled = false;

    const renderMap = async () => {
      try {
        await loadGoogleMapsScript(googleMapsKey);
        if (cancelled) {
          return;
        }

        const windowWithGoogle = window as Window & {
          google?: {
            maps?: {
              Map: new (
                element: HTMLElement,
                options: { center: { lat: number; lng: number }; zoom: number; mapTypeControl?: boolean; streetViewControl?: boolean },
              ) => { fitBounds: (bounds: { extend: (point: { lat: number; lng: number }) => void }) => void; setZoom: (zoom: number) => void };
              Marker: new (options: { map: unknown; position: { lat: number; lng: number }; label?: string; title?: string }) => unknown;
              Polyline: new (options: { map: unknown; path: Array<{ lat: number; lng: number }>; geodesic?: boolean; strokeColor?: string; strokeOpacity?: number; strokeWeight?: number }) => unknown;
              LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
            };
          };
        };

        const maps = windowWithGoogle.google?.maps;
        if (!maps) {
          return;
        }

        const center = { lat: mapStops[0].lat, lng: mapStops[0].lng };
        const map = new maps.Map(container, {
          center,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
        });

        const path = mapStops.map((stop) => ({ lat: stop.lat, lng: stop.lng }));

        path.forEach((position, index) => {
          new maps.Marker({
            map,
            position,
            label: String(index + 1),
            title: mapStops[index]?.direccion || `Parada ${index + 1}`,
          });
        });

        new maps.Polyline({
          map,
          path,
          geodesic: true,
          strokeColor: "#1d4ed8",
          strokeOpacity: 0.9,
          strokeWeight: 4,
        });

        const bounds = new maps.LatLngBounds();
        path.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds);

        if (path.length === 1) {
          map.setZoom(15);
        }
      } catch {
        // Si Google Maps falla, mantenemos el resto del panel operativo.
      }
    };

    void renderMap();

    return () => {
      cancelled = true;
    };
  }, [googleMapsKey, mapStops]);

  const availableStatuses = useMemo(() => {
    return Array.from(new Set(plans.map((plan) => plan.status))).sort();
  }, [plans]);

  const filteredPlans = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return plans.filter((plan) => {
      if (statusFilter !== "all" && plan.status !== statusFilter) {
        return false;
      }

      const planningDate = new Date(plan.planningDate);
      if (fromDate) {
        const minDate = new Date(`${fromDate}T00:00:00`);
        if (planningDate < minDate) {
          return false;
        }
      }

      if (toDate) {
        const maxDate = new Date(`${toDate}T23:59:59`);
        if (planningDate > maxDate) {
          return false;
        }
      }

      if (plan.totalAssigned < minAssigned) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const routeNames = plan.routes.map((route) => route.nombre.toLowerCase()).join(" ");
      const routeClaims = plan.routes.map((route) => String(route.assignedClaims)).join(" ");

      return (
        plan.id.toLowerCase().includes(normalizedSearch) ||
        plan.status.toLowerCase().includes(normalizedSearch) ||
        routeNames.includes(normalizedSearch) ||
        routeClaims.includes(normalizedSearch)
      );
    });
  }, [fromDate, minAssigned, plans, search, statusFilter, toDate]);

  const loadPlans = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await routingService.getPlans();
      setPlans(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las rutas generadas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPlans();
  }, []);

  const handleOpenPlan = async (planId: string) => {
    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      const response = await routingService.getPlan(planId);
      const mapped = mapPlanToSimulation(response.data);
      setSelectedPlan(mapped);
      setSelectedCrewId(mapped.routes[0]?.crewId ?? "");
      setOkMessage(`Plan cargado: ${response.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el plan generado.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPlan = async (planId: string) => {
    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      const result = await routingService.confirmPlan(planId);
      await loadPlans();
      setOkMessage(result.message || "Plan confirmado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el plan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      await routingService.deletePlan(planId);
      if (selectedPlan?.savedPlanId === planId) {
        setSelectedPlan(null);
        setSelectedCrewId("");
      }
      await loadPlans();
      setOkMessage("Plan de rutas eliminado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el plan de rutas.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.stack}>
      <article className={styles.card}>
        <div className={styles.head}>
          <div>
            <h2>Rutas generadas</h2>
            <span>Submodulo de consulta, confirmacion y limpieza de planes generados.</span>
          </div>
        </div>

        {okMessage && <div className={styles.statusOk}>{okMessage}</div>}
        {error && <div className={styles.statusError}>{error}</div>}

        <div className={styles.toolbarRow}>
          <label className={styles.field} htmlFor="generated-search">
            <span>Buscar</span>
            <input
              id="generated-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Plan, estado o cuadrilla"
            />
          </label>

          <label className={styles.field} htmlFor="generated-status-filter">
            <span>Estado</span>
            <select
              id="generated-status-filter"
              className={styles.select}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field} htmlFor="generated-from-date">
            <span>Desde</span>
            <input id="generated-from-date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>

          <label className={styles.field} htmlFor="generated-to-date">
            <span>Hasta</span>
            <input id="generated-to-date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>

          <label className={styles.field} htmlFor="generated-min-assigned">
            <span>Asignados min.</span>
            <input
              id="generated-min-assigned"
              type="number"
              min={0}
              value={minAssigned}
              onChange={(event) => setMinAssigned(Number(event.target.value || 0))}
            />
          </label>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Asignados</th>
                <th>No asignados</th>
                <th>Rutas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Cargando rutas generadas...</td>
                </tr>
              ) : filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={6}>No hay rutas generadas para los filtros actuales.</td>
                </tr>
              ) : (
                filteredPlans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{new Date(plan.planningDate).toLocaleString()}</td>
                    <td>{plan.status}</td>
                    <td>{plan.totalAssigned}</td>
                    <td>{plan.totalUnassigned}</td>
                    <td>{plan.routes.map((route) => `${route.nombre} (${route.assignedClaims})`).join(", ") || "-"}</td>
                    <td>
                      <div className={styles.actionsRow}>
                        <button className={styles.buttonSecondary} type="button" onClick={() => void handleOpenPlan(plan.id)} disabled={submitting}>
                          Ver
                        </button>
                        <button className={styles.buttonSecondary} type="button" onClick={() => void handleConfirmPlan(plan.id)} disabled={submitting || plan.status === "confirmed"}>
                          Confirmar
                        </button>
                        <button className={styles.buttonSecondary} type="button" onClick={() => void handleDeletePlan(plan.id)} disabled={submitting}>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {selectedPlan && (
        <article className={styles.card}>
          <div className={styles.head}>
            <div>
              <h3>Detalle del plan</h3>
              <span>Revision de la ruta seleccionada antes de cualquier accion operativa.</span>
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.metric}><span>Reclamos leidos</span><strong>{selectedPlan.summary.totalFetched}</strong></div>
            <div className={styles.metric}><span>Asignados</span><strong>{selectedPlan.summary.totalAssigned}</strong></div>
            <div className={styles.metric}><span>No asignados</span><strong>{selectedPlan.summary.totalUnassigned}</strong></div>
            <div className={styles.metric}><span>Rutas generadas</span><strong>{selectedPlan.routes.length}</strong></div>
          </div>

          {selectedPlan.routes.length > 0 && (
            <div className={styles.routePickerWrap}>
              <label htmlFor="generated-route-picker" className={styles.subtle}>Ruta a revisar</label>
              <select id="generated-route-picker" className={styles.select} value={selectedRoute?.crewId ?? ""} onChange={(event) => setSelectedCrewId(event.target.value)}>
                {selectedPlan.routes.map((route) => (
                  <option key={route.crewId} value={route.crewId}>
                    {route.nombre} ({route.assignedClaims} reclamos)
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedRoute && (
            <div className={styles.grid}>
              <div className={styles.metric}><span>Usuario operativo</span><strong>{selectedRoute.nombre || selectedRoute.crewId}</strong></div>
              <div className={styles.metric}><span>Paradas</span><strong>{selectedRoute.assignedClaims}</strong></div>
              <div className={styles.metric}><span>Distancia total (km)</span><strong>{selectedRoute.totalDistanceKm}</strong></div>
              <div className={styles.metric}><span>Duracion total (min)</span><strong>{selectedRoute.totalDurationMin}</strong></div>
            </div>
          )}

          <div className={styles.formSection}>
            <h4 className={styles.sectionTitle}>Mapa de la ruta</h4>
            {!googleMapsKey ? (
              <p className={styles.subtle}>Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para visualizar el mapa de Google.</p>
            ) : mapStops.length === 0 ? (
              <p className={styles.subtle}>No hay coordenadas validas para dibujar la ruta seleccionada.</p>
            ) : (
              <div
                ref={mapContainerRef}
                style={{ width: "100%", height: "360px", borderRadius: "12px", overflow: "hidden" }}
              />
            )}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Sec.</th>
                  <th>Reclamo</th>
                  <th>Categoria</th>
                  <th>Direccion</th>
                  <th>Dist. tramo (km)</th>
                  <th>Dur. tramo (min)</th>
                </tr>
              </thead>
              <tbody>
                {visibleStops.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No hay paradas para la ruta seleccionada.</td>
                  </tr>
                ) : (
                  visibleStops.map((stop) => (
                    <tr key={`${stop.reclamoId}-${stop.sequence}`}>
                      <td>{stop.sequence}</td>
                      <td>{stop.reclamoId}</td>
                      <td>{stop.categoria}</td>
                      <td>{stop.direccion}</td>
                      <td>{stop.distanceFromPreviousKm}</td>
                      <td>{stop.durationFromPreviousMin}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}
