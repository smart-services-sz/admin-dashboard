"use client";

import { useEffect, useMemo, useState } from "react";
import {
  routingService,
  type RoutingRulesResponse,
  type RoutingSimulationResult,
  type UpsertRoutingRulesPayload,
} from "@/services/routing.service";
import { accessControlService, type ManagedUser } from "@/services/access-control.service";
import styles from "./routing-panel.module.css";

const DEFAULT_RULES: UpsertRoutingRulesPayload = {
  categoryRules: [
    { categoria: "alumbrado", cupoDiario: 20, pesoPrioridad: 2 },
    { categoria: "baches_y_pavimento", cupoDiario: 12, pesoPrioridad: 3 },
  ],
  crews: [
    {
      crewId: "usuario-operativo-norte",
      userId: "usuario-operativo-norte",
      nombre: "Usuario Operativo Norte",
      userName: "Usuario Operativo Norte",
      maxReclamosDiarios: 15,
      allowedCategorias: ["alumbrado", "baches_y_pavimento"],
      allowedZoneIds: ["zona-norte"],
      startLat: -34.55,
      startLng: -58.45,
    },
  ],
  zones: [
    {
      id: "zona-norte",
      nombre: "Zona Norte",
      minLat: -34.7,
      maxLat: -34.4,
      minLng: -58.6,
      maxLng: -58.3,
    },
  ],
};

export function RoutingPanel() {
  const [maxFetch, setMaxFetch] = useState(200);
  const [useGoogleOptimization, setUseGoogleOptimization] = useState(true);
  const [originLat, setOriginLat] = useState(-34.55);
  const [originLng, setOriginLng] = useState(-58.45);
  const [originQuery, setOriginQuery] = useState("");
  const [originFormattedAddress, setOriginFormattedAddress] = useState("");
  const [dailyByUser, setDailyByUser] = useState(15);
  const [dailyByCategory, setDailyByCategory] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [rules, setRules] = useState<RoutingRulesResponse | null>(null);
  const [simulation, setSimulation] = useState<RoutingSimulationResult | null>(null);
  const [lastPlanId, setLastPlanId] = useState<string>("");
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");
  const [operationalUsers, setOperationalUsers] = useState<ManagedUser[]>([]);
  const [selectedOperationalUserId, setSelectedOperationalUserId] = useState<string>("");
  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([]);

  const humanizeReason = (reason: string): string => {
    const dictionary: Record<string, string> = {
      category_quota_reached: "Cupo de categoria alcanzado",
      no_eligible_crew: "Sin usuario operativo elegible",
    };
    return dictionary[reason] ?? reason;
  };

  useEffect(() => {
    const loadOperationalUsers = async () => {
      try {
        const response = await accessControlService.getActiveUsersByRole("AGENT");
        const agentUsers = response.data;

        setOperationalUsers(agentUsers);
        setSelectedOperationalUserId((current) =>
          current && agentUsers.some((user) => user.id === current)
            ? current
            : (agentUsers[0]?.id ?? ""),
        );
      } catch {
        // Non-blocking: routing config can still work with existing persisted rules.
      }
    };

    void loadOperationalUsers();
  }, []);

  const topStops = useMemo(() => {
    if (!simulation) return [];
    return simulation.routes.flatMap((route) =>
      route.stops.slice(0, 3).map((stop) => ({
        crewId: route.crewId,
        crewName: route.nombre,
        ...stop,
      })),
    );
  }, [simulation]);

  const selectedRoute = useMemo(() => {
    if (!simulation?.routes?.length) {
      return null;
    }

    if (!selectedCrewId) {
      return simulation.routes[0];
    }

    return simulation.routes.find((route) => route.crewId === selectedCrewId) ?? simulation.routes[0];
  }, [simulation, selectedCrewId]);

  const mapUrl = useMemo(() => {
    if (!selectedRoute || selectedRoute.stops.length < 2) {
      return "";
    }

    const points = selectedRoute.stops.map((stop) => `${stop.lat},${stop.lng}`);
    const origin = points[0];
    const destination = points[points.length - 1];
    const midPoints = points.slice(1, -1);
    const waypoints = midPoints.join("|");
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (key) {
      const query = [
        `key=${encodeURIComponent(key)}`,
        `origin=${encodeURIComponent(origin)}`,
        `destination=${encodeURIComponent(destination)}`,
        "mode=driving",
      ];

      if (waypoints) {
        query.push(`waypoints=${encodeURIComponent(waypoints)}`);
      }

      return `https://www.google.com/maps/embed/v1/directions?${query.join("&")}`;
    }

    const fallback = [
      "api=1",
      `origin=${encodeURIComponent(origin)}`,
      `destination=${encodeURIComponent(destination)}`,
      "travelmode=driving",
    ];

    if (waypoints) {
      fallback.push(`waypoints=${encodeURIComponent(waypoints)}`);
    }

    return `https://www.google.com/maps/dir/?${fallback.join("&")}`;
  }, [selectedRoute]);

  const originMapUrl = useMemo(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const coordinateQuery = `${originLat},${originLng}`;

    if (key) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
        key,
      )}&q=${encodeURIComponent(coordinateQuery)}`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinateQuery)}`;
  }, [originLat, originLng]);

  const categoryOptions = useMemo(
    () =>
      (rules?.data.categoryRules.length ? rules.data.categoryRules : DEFAULT_RULES.categoryRules).map(
        (rule) => rule.categoria,
      ),
    [rules],
  );

  const runAction = async (task: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setOkMessage(null);

    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operacion fallida");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadRules = async () => {
    await runAction(async () => {
      const response = await routingService.getRules();
      setRules(response);
      setSelectedCategorias((current) =>
        current.length > 0
          ? current.filter((categoria) =>
              response.data.categoryRules.some((rule) => rule.categoria === categoria),
            )
          : [],
      );
      setOkMessage("Reglas de ruteo cargadas.");
    });
  };

  const handleSearchOrigin = async () => {
    if (!originQuery.trim()) {
      setError("Ingresa una direccion para buscar el origen.");
      return;
    }

    await runAction(async () => {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key) {
        throw new Error("Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en admin-dashboard.");
      }

      const url =
        "https://maps.googleapis.com/maps/api/geocode/json?" +
        `address=${encodeURIComponent(originQuery.trim())}&key=${encodeURIComponent(key)}`;

      const response = await fetch(url);
      const data = (await response.json()) as {
        status: string;
        results?: Array<{
          formatted_address?: string;
          geometry?: { location?: { lat?: number; lng?: number } };
        }>;
      };

      if (data.status !== "OK" || !data.results?.length) {
        throw new Error(`No se pudo geocodificar el origen (${data.status}).`);
      }

      const first = data.results[0];
      const lat = first.geometry?.location?.lat;
      const lng = first.geometry?.location?.lng;

      if (typeof lat !== "number" || typeof lng !== "number") {
        throw new Error("La respuesta de geocoding no trajo coordenadas validas.");
      }

      setOriginLat(lat);
      setOriginLng(lng);
      setOriginFormattedAddress(first.formatted_address ?? "");
      setOkMessage("Origen actualizado desde direccion.");
    });
  };

  const buildFastAssignmentPayload = async (): Promise<UpsertRoutingRulesPayload> => {
    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      throw new Error("Define un origen valido (lat/lng)");
    }

    if (!selectedOperationalUserId) {
      throw new Error("Selecciona un usuario AGENT para asignar la ruta.");
    }

    const selectedUser = operationalUsers.find((user) => user.id === selectedOperationalUserId);
    if (!selectedUser) {
      throw new Error("El usuario AGENT seleccionado no esta disponible.");
    }

    const baseRules =
      rules?.data ??
      (await routingService.getRules()).data ?? {
        categoryRules: [],
        crews: [],
        zones: [],
      };

    const seedSource =
      baseRules.categoryRules.length > 0 && baseRules.zones.length > 0
        ? baseRules
        : DEFAULT_RULES;

    const effectiveCategoryRules = seedSource.categoryRules
      .filter((rule) => selectedCategorias.length === 0 || selectedCategorias.includes(rule.categoria))
      .map((rule) => ({
        ...rule,
        cupoDiario: dailyByCategory,
      }));

    if (effectiveCategoryRules.length === 0) {
      throw new Error("Selecciona al menos una categoria para el plan.");
    }

    return {
      categoryRules: effectiveCategoryRules,
      crews: [
        {
          crewId: selectedUser.id,
          userId: selectedUser.id,
          nombre: selectedUser.name || selectedUser.email,
          userName: selectedUser.name || selectedUser.email,
          maxReclamosDiarios: dailyByUser,
          allowedCategorias: effectiveCategoryRules.map((rule) => rule.categoria),
          allowedZoneIds: seedSource.zones?.map((zone) => zone.id) ?? [],
          startLat: originLat,
          startLng: originLng,
        },
      ],
      zones: seedSource.zones,
    };
  };

  const handleApplyBasicConfig = async () => {
    await runAction(async () => {
      const payload = await buildFastAssignmentPayload();
      await routingService.upsertRules(payload);
      const refreshed = await routingService.getRules();
      setRules(refreshed);
      setOkMessage("Configuracion rapida aplicada: usuario AGENT + categorias + cupos.");
    });
  };

  const handleSimulate = async () => {
    await runAction(async () => {
      const response = await routingService.simulate({
        maxFetch,
        useGoogleOptimization,
        originLat,
        originLng,
      });
      setSimulation(response);
      setSelectedCrewId(response.routes?.[0]?.crewId ?? "");
      if (response.savedPlanId) {
        setLastPlanId(response.savedPlanId);
      }
      setOkMessage("Simulacion ejecutada correctamente.");
    });
  };

  const handleGenerate = async () => {
    await runAction(async () => {
      const response = await routingService.generate({
        maxFetch,
        useGoogleOptimization,
        originLat,
        originLng,
      });
      setSimulation(response);
      setSelectedCrewId(response.routes?.[0]?.crewId ?? "");
      if (response.savedPlanId) {
        setLastPlanId(response.savedPlanId);
      }
      setOkMessage(`Plan generado. ID: ${response.savedPlanId ?? "sin id"}`);
    });
  };

  const handleConfirmPlan = async () => {
    if (!lastPlanId.trim()) {
      setError("Ingresa un planId o genera un plan primero.");
      return;
    }

    await runAction(async () => {
      const result = await routingService.confirmPlan(lastPlanId.trim());
      setOkMessage(result.message || "Plan confirmado.");
    });
  };

  const handleGenerateAndConfirm = async () => {
    await runAction(async () => {
      const payload = await buildFastAssignmentPayload();
      await routingService.upsertRules(payload);

      const generated = await routingService.generate({
        maxFetch,
        useGoogleOptimization,
        originLat,
        originLng,
      });

      setSimulation(generated);
      setSelectedCrewId(generated.routes?.[0]?.crewId ?? "");

      const planId = generated.savedPlanId;
      if (!planId) {
        throw new Error("No se pudo obtener planId al generar.");
      }

      setLastPlanId(planId);
      const confirmation = await routingService.confirmPlan(planId);
      setOkMessage(`Plan generado y confirmado. ${confirmation.message}`);
    });
  };

  return (
    <section className={styles.stack}>
      <article className={styles.card}>
        <div className={styles.head}>
          <h2>Ruteo operativo</h2>
          <span>Asignacion rapida de rutas a un usuario AGENT</span>
        </div>

        <div className={styles.formSection}>
          <h4 className={styles.sectionTitle}>Configuracion rapida</h4>
          <p className={styles.subtle}>
            Flujo recomendado: elige un AGENT, marca categorias, define origen y cupos, y luego genera/confirmar plan.
          </p>

          <div className={styles.formSection}>
            <h5 className={styles.sectionTitle}>Usuario AGENT para asignacion</h5>
            <p className={styles.subtle}>
              Solo se listan usuarios activos con rol AGENT.
            </p>
            {operationalUsers.length === 0 ? (
              <p className={styles.subtle}>
                No hay usuarios activos con rol AGENT disponibles para asignacion.
              </p>
            ) : (
              <label className={styles.field} htmlFor="agent-user-id">
                <span>Usuario operativo</span>
                <select
                  id="agent-user-id"
                  className={styles.select}
                  value={selectedOperationalUserId}
                  onChange={(e) => setSelectedOperationalUserId(e.target.value)}
                >
                  {operationalUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className={styles.formSection}>
            <h5 className={styles.sectionTitle}>Areas de reclamo (categorias)</h5>
            <p className={styles.subtle}>
              Marca las categorias para este plan. Si no marcas ninguna, se consideran todas.
            </p>
            <div className={styles.grid}>
              {categoryOptions.map((categoria) => {
                const checked = selectedCategorias.includes(categoria);
                return (
                  <label key={categoria} className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedCategorias((current) =>
                          e.target.checked
                            ? [...current, categoria]
                            : current.filter((item) => item !== categoria),
                        );
                      }}
                    />
                    <span>{categoria}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="origin-query">
              <span>Buscar punto de origen por direccion</span>
              <input
                id="origin-query"
                type="text"
                value={originQuery}
                onChange={(e) => setOriginQuery(e.target.value)}
                placeholder="Ej: Av. Corrientes 1000, Buenos Aires"
              />
            </label>
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.buttonSecondary} type="button" onClick={handleSearchOrigin} disabled={loading}>
              Buscar origen
            </button>
            {originFormattedAddress && (
              <span className={styles.subtle}>Origen detectado: {originFormattedAddress}</span>
            )}
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="origin-lat">
              <span>Punto de origen (latitud)</span>
              <input
                id="origin-lat"
                type="number"
                step="0.000001"
                value={originLat}
                onChange={(e) => setOriginLat(Number(e.target.value || 0))}
                placeholder="Ej: -34.550000"
              />
            </label>

            <label className={styles.field} htmlFor="origin-lng">
              <span>Punto de origen (longitud)</span>
              <input
                id="origin-lng"
                type="number"
                step="0.000001"
                value={originLng}
                onChange={(e) => setOriginLng(Number(e.target.value || 0))}
                placeholder="Ej: -58.450000"
              />
            </label>

            <label className={styles.field} htmlFor="daily-by-user">
              <span>Reclamos diarios por usuario operativo</span>
              <input
                id="daily-by-user"
                type="number"
                min={1}
                value={dailyByUser}
                onChange={(e) => setDailyByUser(Number(e.target.value || 1))}
                placeholder="Ej: 15"
              />
            </label>

            <label className={styles.field} htmlFor="daily-by-category">
              <span>Reclamos diarios por categoria</span>
              <input
                id="daily-by-category"
                type="number"
                min={1}
                value={dailyByCategory}
                onChange={(e) => setDailyByCategory(Number(e.target.value || 1))}
                placeholder="Ej: 20"
              />
            </label>
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.buttonSecondary} type="button" onClick={handleApplyBasicConfig} disabled={loading}>
              Aplicar configuracion rapida
            </button>
          </div>

          <div className={styles.mapWrap}>
            {originMapUrl && (
              <iframe
                title="Mapa de punto de origen"
                src={originMapUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            )}
          </div>
        </div>

        <div className={styles.formSection}>
          <h4 className={styles.sectionTitle}>Ejecucion de ruteo</h4>
          <p className={styles.subtle}>
            Simula para validar y luego genera/confirmar para dejar la ruta asignada al AGENT seleccionado.
          </p>

          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="max-fetch">
              <span>Maximo de reclamos a evaluar</span>
              <input
                id="max-fetch"
                type="number"
                min={50}
                max={5000}
                value={maxFetch}
                onChange={(e) => setMaxFetch(Number(e.target.value || 200))}
              />
            </label>

            <label className={styles.checkbox} htmlFor="google-optimize">
              <input
                id="google-optimize"
                type="checkbox"
                checked={useGoogleOptimization}
                onChange={(e) => setUseGoogleOptimization(e.target.checked)}
              />
              Usar optimizacion de Google
            </label>
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.buttonSecondary} type="button" onClick={handleLoadRules} disabled={loading}>
              Ver reglas
            </button>
            <button className={styles.buttonPrimary} type="button" onClick={handleSimulate} disabled={loading}>
              Simular
            </button>
            <button className={styles.buttonPrimary} type="button" onClick={handleGenerate} disabled={loading}>
              Generar plan
            </button>
            <button className={styles.buttonPrimary} type="button" onClick={handleGenerateAndConfirm} disabled={loading}>
              Aplicar + generar + confirmar
            </button>
          </div>
        </div>

        <div className={styles.formSection}>
          <h4 className={styles.sectionTitle}>Confirmacion manual (opcional)</h4>
          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="plan-id">
              <span>Plan ID</span>
              <input
                id="plan-id"
                type="text"
                placeholder="UUID del plan"
                value={lastPlanId}
                onChange={(e) => setLastPlanId(e.target.value)}
              />
            </label>
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.buttonSecondary} type="button" onClick={handleConfirmPlan} disabled={loading}>
              Confirmar plan
            </button>
          </div>
        </div>

        {okMessage && <div className={styles.statusOk}>{okMessage}</div>}
        {error && <div className={styles.statusError}>{error}</div>}
      </article>

      {rules && (
        <article className={styles.card}>
          <div className={styles.head}>
            <h3>Reglas vigentes</h3>
            <span>
              {rules.data.categoryRules.length} categorias · {rules.data.crews.length} usuarios operativos · {rules.data.zones.length} zonas
            </span>
          </div>
          <p className={styles.subtle}>
            Las reglas configuradas aqui se usan para decidir cupos por categoria y elegibilidad por usuario/zona.
          </p>
        </article>
      )}

      {simulation && (
        <article className={styles.card}>
          <div className={styles.head}>
            <h3>Resultado de ruteo</h3>
            <span>{simulation.planningDate}</span>
          </div>

          <div className={styles.grid}>
            <div className={styles.metric}>
              <span>Reclamos leidos</span>
              <strong>{simulation.summary.totalFetched}</strong>
            </div>
            <div className={styles.metric}>
              <span>Asignados</span>
              <strong>{simulation.summary.totalAssigned}</strong>
            </div>
            <div className={styles.metric}>
              <span>No asignados</span>
              <strong>{simulation.summary.totalUnassigned}</strong>
            </div>
            <div className={styles.metric}>
              <span>Google optimize</span>
              <strong>
                {simulation.summary.googleOptimization.enabled
                  ? `${simulation.summary.googleOptimization.optimizedRoutes} optimizadas`
                  : "desactivado"}
              </strong>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Usuario operativo</th>
                  <th>Sec.</th>
                  <th>Reclamo</th>
                  <th>Categoria</th>
                  <th>Dist. tramo (km)</th>
                  <th>Dur. tramo (min)</th>
                </tr>
              </thead>
              <tbody>
                {topStops.length === 0 && (
                  <tr>
                    <td colSpan={6}>No hay paradas en la simulacion.</td>
                  </tr>
                )}
                {topStops.map((stop) => (
                  <tr key={`${stop.crewId}-${stop.reclamoId}-${stop.sequence}`}>
                    <td>{stop.crewName}</td>
                    <td>{stop.sequence}</td>
                    <td>{stop.reclamoId}</td>
                    <td>{stop.categoria}</td>
                    <td>{stop.distanceFromPreviousKm}</td>
                    <td>{stop.durationFromPreviousMin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(simulation.summary.unassignedByReason).length > 0 && (
            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Diagnostico de no asignacion</h4>
              <p className={styles.subtle}>
                Este resumen ayuda a entender por que algunos reclamos no entraron en la ruta.
              </p>
              <div className={styles.grid}>
                {Object.entries(simulation.summary.unassignedByReason).map(([reason, count]) => (
                  <div key={reason} className={styles.metric}>
                    <span>{humanizeReason(reason)}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.routePickerWrap}>
            <label htmlFor="route-picker" className={styles.subtle}>
              Ruta a visualizar
            </label>
            <select
              id="route-picker"
              className={styles.select}
              value={selectedRoute?.crewId ?? ""}
              onChange={(e) => setSelectedCrewId(e.target.value)}
            >
              {simulation.routes.map((route) => (
                <option key={route.crewId} value={route.crewId}>
                  {route.nombre} ({route.assignedClaims} reclamos)
                </option>
              ))}
            </select>
          </div>

          {selectedRoute && (
            <div className={styles.grid}>
              <div className={styles.metric}>
                <span>Usuario operativo</span>
                <strong>{selectedRoute.nombre || selectedRoute.crewId}</strong>
              </div>
              <div className={styles.metric}>
                <span>Paradas</span>
                <strong>{selectedRoute.assignedClaims}</strong>
              </div>
              <div className={styles.metric}>
                <span>Distancia total (km)</span>
                <strong>{selectedRoute.totalDistanceKm}</strong>
              </div>
              <div className={styles.metric}>
                <span>Duracion total (min)</span>
                <strong>{selectedRoute.totalDurationMin}</strong>
              </div>
            </div>
          )}

          <div className={styles.mapWrap}>
            {!selectedRoute && <p className={styles.subtle}>No hay ruta seleccionada.</p>}
            {selectedRoute && selectedRoute.stops.length < 2 && (
              <p className={styles.subtle}>
                Se necesitan al menos 2 paradas para visualizar una ruta en el mapa.
              </p>
            )}
            {selectedRoute && selectedRoute.stops.length >= 2 && mapUrl && (
              <iframe
                title={`Mapa de ruta ${selectedRoute.nombre}`}
                src={mapUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            )}
          </div>
        </article>
      )}
    </section>
  );
}
