"use client";

import { useEffect, useMemo, useState } from "react";
import { accessControlService, type ManagedUser } from "@/services/access-control.service";
import {
  routingService,
  type RoutingAreaPlan,
  type RoutingRulesResponse,
  type RoutingSimulationResult,
  type RoutingZoneRule,
  type UpsertRoutingRulesPayload,
} from "@/services/routing.service";
import styles from "./routing-panel.module.css";

const DEFAULT_RULES: UpsertRoutingRulesPayload = {
  categoryRules: [
    { categoria: "alumbrado", cupoDiario: 20, pesoPrioridad: 2 },
    { categoria: "baches_y_pavimento", cupoDiario: 12, pesoPrioridad: 3 },
  ],
  crews: [],
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

function sanitizeZones(zones: RoutingZoneRule[]) {
  return zones.map((zone) => ({
    id: zone.id,
    nombre: zone.nombre,
    minLat: zone.minLat,
    maxLat: zone.maxLat,
    minLng: zone.minLng,
    maxLng: zone.maxLng,
  }));
}

export function RoutingRoutesPanel() {
  const [plans, setPlans] = useState<RoutingAreaPlan[]>([]);
  const [agentUsers, setAgentUsers] = useState<ManagedUser[]>([]);
  const [rules, setRules] = useState<RoutingRulesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [maxFetch, setMaxFetch] = useState<number>(200);
  const [useGoogleOptimization, setUseGoogleOptimization] = useState<boolean>(true);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [loadedClaims, setLoadedClaims] = useState<RoutingSimulationResult | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<RoutingSimulationResult | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");

  const availableAreas = useMemo(() => {
    const areas = new Set<string>();
    for (const plan of plans) {
      for (const categoria of plan.categorias) {
        areas.add(categoria);
      }
    }
    return Array.from(areas).sort();
  }, [plans]);

  const visiblePlans = useMemo(() => {
    return plans.filter((plan) => selectedArea === "all" || plan.categorias.includes(selectedArea));
  }, [plans, selectedArea]);

  const selectedPlan = useMemo(() => {
    return plans.find((plan) => plan.id === selectedPlanId) ?? null;
  }, [plans, selectedPlanId]);

  const selectedRoute = useMemo(() => {
    if (!generatedPlan?.routes?.length) return null;
    if (!selectedCrewId) return generatedPlan.routes[0];
    return generatedPlan.routes.find((route) => route.crewId === selectedCrewId) ?? generatedPlan.routes[0];
  }, [generatedPlan, selectedCrewId]);

  const visibleStops = useMemo(() => {
    return selectedRoute?.stops ?? [];
  }, [selectedRoute]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [plansResponse, usersResponse, rulesResponse] = await Promise.all([
        routingService.getAreaPlans(),
        accessControlService.getActiveUsersByRole("AGENT"),
        routingService.getRules(),
      ]);

      setPlans(plansResponse.data);
      setAgentUsers(usersResponse.data);
      setRules(rulesResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el modulo de rutas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!selectedPlan) {
      setSelectedUserId("");
      return;
    }

    setSelectedUserId(selectedPlan.userId);
  }, [selectedPlan]);

  const resetWizard = () => {
    setSelectedArea("all");
    setSelectedPlanId("");
    setSelectedUserId("");
    setMaxFetch(200);
    setUseGoogleOptimization(true);
    setWizardStep(1);
    setLoadedClaims(null);
    setGeneratedPlan(null);
    setSelectedCrewId("");
    setError(null);
    setOkMessage(null);
  };

  const buildPayload = async (plan: RoutingAreaPlan, userId: string): Promise<UpsertRoutingRulesPayload> => {
    const selectedUser = agentUsers.find((user) => user.id === userId);
    if (!selectedUser) {
      throw new Error("Selecciona un usuario operativo valido.");
    }

    const baseRules = rules?.data ?? (await routingService.getRules()).data ?? { categoryRules: [], crews: [], zones: [] };
    const seedSource = baseRules.categoryRules.length > 0 && baseRules.zones.length > 0 ? baseRules : DEFAULT_RULES;
    const categoryRules = seedSource.categoryRules
      .filter((rule) => plan.categorias.length === 0 || plan.categorias.includes(rule.categoria))
      .map((rule) => ({ ...rule, cupoDiario: plan.dailyByCategory }));

    if (categoryRules.length === 0) {
      throw new Error("El plan seleccionado no tiene categorias configuradas para ruteo.");
    }

    return {
      categoryRules,
      crews: [
        {
          crewId: selectedUser.id,
          userId: selectedUser.id,
          nombre: selectedUser.name || selectedUser.email,
          userName: selectedUser.name || selectedUser.email,
          maxReclamosDiarios: plan.dailyByUser,
          allowedCategorias: categoryRules.map((rule) => rule.categoria),
          allowedZoneIds: [],
          startLat: plan.originLat,
          startLng: plan.originLng,
        },
      ],
      zones: sanitizeZones(seedSource.zones ?? []),
    };
  };

  const handleContinueToLoad = () => {
    if (!selectedPlan) {
      setError("Selecciona un plan para continuar.");
      return;
    }

    setError(null);
    setOkMessage(`Plan listo para cargar reclamos: ${selectedPlan.name}`);
    setWizardStep(2);
  };

  const handleLoadClaims = async () => {
    if (!selectedPlan) {
      setError("Selecciona un plan para cargar reclamos.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      const payload = await buildPayload(selectedPlan, selectedPlan.userId);
      const result = await routingService.simulate({
        maxFetch,
        useGoogleOptimization: false,
        originLat: selectedPlan.originLat,
        originLng: selectedPlan.originLng,
        overrideRules: payload,
      });

      setLoadedClaims(result);
      setGeneratedPlan(null);
      setSelectedCrewId("");
      setWizardStep(3);
      setOkMessage("Reclamos cargados. Ya puedes generar la ruta optimizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los reclamos.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateRoute = async () => {
    if (!selectedPlan) {
      setError("Selecciona un plan para generar la ruta.");
      return;
    }

    if (!selectedUserId) {
      setError("Selecciona el usuario operativo para esta ruta.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      const payload = await buildPayload(selectedPlan, selectedUserId);
      await routingService.upsertRules(payload);
      const result = await routingService.generate({
        maxFetch,
        useGoogleOptimization,
        originLat: selectedPlan.originLat,
        originLng: selectedPlan.originLng,
        overrideRules: payload,
      });

      setGeneratedPlan(result);
      setSelectedCrewId(result.routes[0]?.crewId ?? "");
      setWizardStep(4);
      setOkMessage("Ruta optimizada generada. Revisa el resultado y confirma si esta correcta.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la ruta.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmGeneratedPlan = async () => {
    if (!generatedPlan?.savedPlanId) {
      setError("No hay un plan generado para confirmar.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      const result = await routingService.confirmPlan(generatedPlan.savedPlanId);
      setOkMessage(result.message || "Plan confirmado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el plan generado.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.stack}>
      <article className={styles.card}>
        <div className={styles.head}>
          <div>
            <h2>Generacion de rutas</h2>
            <span>Proceso guiado, paso a paso, sin mostrar todo junto.</span>
          </div>
          <button className={styles.buttonSecondary} type="button" onClick={resetWizard} disabled={submitting}>
            Reiniciar flujo
          </button>
        </div>

        <div className={styles.guideGrid}>
          <div className={styles.guideItem}>
            <strong>1. Elegir plan</strong>
            <p>Filtra por area y selecciona el plan base.</p>
          </div>
          <div className={styles.guideItem}>
            <strong>2. Cargar reclamos</strong>
            <p>Trae los reclamos candidatos para esa corrida.</p>
          </div>
          <div className={styles.guideItem}>
            <strong>3. Generar ruta</strong>
            <p>Define usuario operativo y optimiza la ruta.</p>
          </div>
          <div className={styles.guideItem}>
            <strong>4. Revisar y confirmar</strong>
            <p>Verifica el resultado antes de confirmarlo.</p>
          </div>
        </div>

        {okMessage && <div className={styles.statusOk}>{okMessage}</div>}
        {error && <div className={styles.statusError}>{error}</div>}

        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Paso 1. Elegir area y plan</h3>
          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="route-area-filter">
              <span>Area</span>
              <select id="route-area-filter" className={styles.select} value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)}>
                <option value="all">Todas</option>
                {availableAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field} htmlFor="route-plan-selector">
              <span>Plan</span>
              <select id="route-plan-selector" className={styles.select} value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)}>
                <option value="">Seleccionar plan</option>
                {visiblePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedPlan && (
            <div className={styles.grid}>
              <div className={styles.metric}>
                <span>Areas</span>
                <strong>{selectedPlan.categorias.join(", ")}</strong>
              </div>
              <div className={styles.metric}>
                <span>Usuario base</span>
                <strong>{selectedPlan.userName || selectedPlan.userId}</strong>
              </div>
              <div className={styles.metric}>
                <span>Origen</span>
                <strong>{selectedPlan.originLat.toFixed(4)}, {selectedPlan.originLng.toFixed(4)}</strong>
              </div>
              <div className={styles.metric}>
                <span>Limites</span>
                <strong>{selectedPlan.dailyByUser} / {selectedPlan.dailyByCategory}</strong>
              </div>
            </div>
          )}

          <div className={styles.actionsRow}>
            <button className={styles.buttonPrimary} type="button" onClick={handleContinueToLoad} disabled={!selectedPlan || submitting || loading}>
              Continuar al paso 2
            </button>
          </div>
        </div>

        {wizardStep >= 2 && selectedPlan && (
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Paso 2. Cargar reclamos</h3>
            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor="route-max-fetch">
                <span>Maximo de reclamos a evaluar</span>
                <input id="route-max-fetch" type="number" min={50} max={5000} value={maxFetch} onChange={(event) => setMaxFetch(Number(event.target.value || 200))} />
              </label>
            </div>

            <div className={styles.actionsRow}>
              <button className={styles.buttonPrimary} type="button" onClick={handleLoadClaims} disabled={submitting}>
                Cargar reclamos
              </button>
            </div>

            {loadedClaims && (
              <div className={styles.grid}>
                <div className={styles.metric}><span>Reclamos leidos</span><strong>{loadedClaims.summary.totalFetched}</strong></div>
                <div className={styles.metric}><span>Candidatos</span><strong>{loadedClaims.summary.totalCandidateAfterRules}</strong></div>
                <div className={styles.metric}><span>Asignables</span><strong>{loadedClaims.summary.totalAssigned}</strong></div>
                <div className={styles.metric}><span>No asignados</span><strong>{loadedClaims.summary.totalUnassigned}</strong></div>
              </div>
            )}
          </div>
        )}

        {wizardStep >= 3 && selectedPlan && loadedClaims && (
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Paso 3. Generar ruta optimizada</h3>
            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor="route-user-selector">
                <span>Usuario operativo</span>
                <select id="route-user-selector" className={styles.select} value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  <option value="">Seleccionar</option>
                  {agentUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.checkbox} htmlFor="route-google-optimize">
                <input id="route-google-optimize" type="checkbox" checked={useGoogleOptimization} onChange={(event) => setUseGoogleOptimization(event.target.checked)} />
                Usar optimizacion de Google
              </label>
            </div>

            <div className={styles.actionsRow}>
              <button className={styles.buttonPrimary} type="button" onClick={handleGenerateRoute} disabled={submitting || !selectedUserId}>
                Generar ruta optimizada
              </button>
            </div>
          </div>
        )}

        {wizardStep >= 4 && generatedPlan && (
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Paso 4. Revisar y confirmar</h3>

            <div className={styles.grid}>
              <div className={styles.metric}><span>Reclamos leidos</span><strong>{generatedPlan.summary.totalFetched}</strong></div>
              <div className={styles.metric}><span>Asignados</span><strong>{generatedPlan.summary.totalAssigned}</strong></div>
              <div className={styles.metric}><span>No asignados</span><strong>{generatedPlan.summary.totalUnassigned}</strong></div>
              <div className={styles.metric}><span>Rutas generadas</span><strong>{generatedPlan.routes.length}</strong></div>
            </div>

            {generatedPlan.routes.length > 0 && (
              <div className={styles.routePickerWrap}>
                <label htmlFor="generated-route-picker" className={styles.subtle}>Ruta a revisar</label>
                <select id="generated-route-picker" className={styles.select} value={selectedRoute?.crewId ?? ""} onChange={(event) => setSelectedCrewId(event.target.value)}>
                  {generatedPlan.routes.map((route) => (
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

            <div className={styles.actionsRow}>
              <button className={styles.buttonPrimary} type="button" onClick={handleConfirmGeneratedPlan} disabled={submitting || !generatedPlan.savedPlanId}>
                Confirmar plan generado
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}