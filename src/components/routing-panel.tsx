"use client";

import { useEffect, useMemo, useState } from "react";
import {
  routingService,
  type RoutingAreaPlan,
  type RoutingPlanListItem,
  type RoutingPlanResponse,
  type RoutingRulesResponse,
  type RoutingSimulationResult,
  type RoutingZoneRule,
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

const LAST_ROUTING_PLAN_ID_KEY = "routing:lastPlanId";
const ROUTING_CATEGORY_OPTIONS = [
  "agua_y_cloacas",
  "alumbrado",
  "baches_y_pavimento",
  "arbolado",
  "residuos",
  "electricidad",
  "gas",
  "transporte",
  "infraestructura",
  "otros",
];

type RoutingAreaPlanDraft = {
  id?: string;
  name: string;
  userId: string;
  userName?: string | null;
  categorias: string[];
  originLat: number;
  originLng: number;
  dailyByUser: number;
  dailyByCategory: number;
};

type RoutingModalContext = "area" | "routes";

type RoutingPanelView = "plans" | "new" | "routes";

type RoutingPanelProps = {
  view?: RoutingPanelView;
};

export function RoutingPanel({ view = "routes" }: RoutingPanelProps) {
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
  const [, setLastPlanId] = useState<string>("");
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");
  const [operationalUsers, setOperationalUsers] = useState<ManagedUser[]>([]);
  const [selectedOperationalUserId, setSelectedOperationalUserId] = useState<string>("");
  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([]);
  const [planName, setPlanName] = useState<string>("");
  const [savedAreaPlans, setSavedAreaPlans] = useState<RoutingAreaPlan[]>([]);
  const [routePlans, setRoutePlans] = useState<RoutingPlanListItem[]>([]);
  const [planSearch, setPlanSearch] = useState<string>("");
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>("all");
  const [planDialogContext, setPlanDialogContext] = useState<RoutingModalContext | null>(null);
  const [draftPlanId, setDraftPlanId] = useState<string>("");
  const [routeModalPlan, setRouteModalPlan] = useState<RoutingAreaPlan | null>(null);

  const humanizeReason = (reason: string): string => {
    const dictionary: Record<string, string> = {
      category_quota_reached: "Cupo de categoria alcanzado",
      no_eligible_crew: "Sin usuario operativo elegible",
    };
    return dictionary[reason] ?? reason;
  };

  const availableAreaFilters = useMemo(() => {
    const areas = new Set<string>();
    for (const plan of savedAreaPlans) {
      for (const categoria of plan.categorias) {
        areas.add(categoria);
      }
    }
    return Array.from(areas).sort();
  }, [savedAreaPlans]);

  const visibleAreaPlans = useMemo(() => {
    const search = planSearch.trim().toLowerCase();
    return savedAreaPlans.filter((plan) => {
      const matchesSearch =
        !search ||
        plan.name.toLowerCase().includes(search) ||
        (plan.userName ?? "").toLowerCase().includes(search);
      const matchesArea =
        selectedAreaFilter === "all" || plan.categorias.includes(selectedAreaFilter);
      return matchesSearch && matchesArea;
    });
  }, [planSearch, savedAreaPlans, selectedAreaFilter]);

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
    if (!simulation?.routes?.length) return null;
    if (!selectedCrewId) return simulation.routes[0];
    return simulation.routes.find((route) => route.crewId === selectedCrewId) ?? simulation.routes[0];
  }, [simulation, selectedCrewId]);

  const categoryOptions = useMemo(
    () => ROUTING_CATEGORY_OPTIONS,
    [],
  );

  const mapUrl = useMemo(() => {
    if (!selectedRoute || selectedRoute.stops.length < 2) return "";

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
      if (waypoints) query.push(`waypoints=${encodeURIComponent(waypoints)}`);
      return `https://www.google.com/maps/embed/v1/directions?${query.join("&")}`;
    }

    const fallback = [
      "api=1",
      `origin=${encodeURIComponent(origin)}`,
      `destination=${encodeURIComponent(destination)}`,
      "travelmode=driving",
    ];
    if (waypoints) fallback.push(`waypoints=${encodeURIComponent(waypoints)}`);
    return `https://www.google.com/maps/dir/?${fallback.join("&")}`;
  }, [selectedRoute]);

  const originMapUrl = useMemo(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const coordinateQuery = `${originLat},${originLng}`;
    if (key) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(coordinateQuery)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinateQuery)}`;
  }, [originLat, originLng]);

  const sanitizeZones = (zones: RoutingZoneRule[]) =>
    zones.map((zone) => ({
      id: zone.id,
      nombre: zone.nombre,
      minLat: zone.minLat,
      maxLat: zone.maxLat,
      minLng: zone.minLng,
      maxLng: zone.maxLng,
    }));

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

  const hydrateStateFromAreaPlan = (plan: Pick<RoutingAreaPlan, "id" | "name" | "userId" | "userName" | "categorias" | "originLat" | "originLng" | "dailyByUser" | "dailyByCategory">) => {
    setPlanName(plan.name);
    setSelectedOperationalUserId(plan.userId);
    setSelectedCategorias(plan.categorias);
    setOriginLat(plan.originLat);
    setOriginLng(plan.originLng);
    setDailyByUser(plan.dailyByUser);
    setDailyByCategory(plan.dailyByCategory);
    setDraftPlanId(plan.id);
  };

  const buildDraftFromState = (): RoutingAreaPlanDraft => ({
    id: draftPlanId || undefined,
    name: planName.trim() || `Plan ${selectedCategorias.join(", ") || "general"}`,
    userId: selectedOperationalUserId,
    userName: operationalUsers.find((user) => user.id === selectedOperationalUserId)?.name ?? undefined,
    categorias: selectedCategorias,
    originLat,
    originLng,
    dailyByUser,
    dailyByCategory,
  });

  const loadAreaPlans = async (preferredPlanId?: string) => {
    const response = await routingService.getAreaPlans();
    setSavedAreaPlans(response.data);
    return response.data;
  };

  const loadRoutePlans = async () => {
    const response = await routingService.getPlans();
    setRoutePlans(response.data);
  };

  const mapPlanToSimulation = (plan: RoutingPlanResponse["data"]): RoutingSimulationResult => ({
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
  });

  const handleLoadPersistedPlan = async (planId: string) => {
    await runAction(async () => {
      const response = await routingService.getPlan(planId);
      const mapped = mapPlanToSimulation(response.data);
      setSimulation(mapped);
      setSelectedCrewId(mapped.routes[0]?.crewId ?? "");
      rememberPlanId(response.data.id);
      setOkMessage(`Plan cargado: ${response.data.id}`);
    });
  };

  const rememberPlanId = (planId: string) => {
    setLastPlanId(planId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_ROUTING_PLAN_ID_KEY, planId);
    }
  };

  useEffect(() => {
    const loadInitialRoutingState = async () => {
      try {
        const [usersResponse, rulesResponse, areaPlansResponse, routePlansResponse] = await Promise.all([
          accessControlService.getActiveUsersByRole("AGENT"),
          routingService.getRules(),
          routingService.getAreaPlans(),
          routingService.getPlans(),
        ]);

        const agentUsers = usersResponse.data;
        setOperationalUsers(agentUsers);
        setRules(rulesResponse);
        setSavedAreaPlans(areaPlansResponse.data);
        setRoutePlans(routePlansResponse.data);

        if (typeof window !== "undefined") {
          const savedPlanId = window.localStorage.getItem(LAST_ROUTING_PLAN_ID_KEY);
          if (savedPlanId) setLastPlanId(savedPlanId);
        }
      } catch {
        // Non-blocking.
      }
    };

    void loadInitialRoutingState();
  }, []);

  const handleLoadRules = async () => {
    await runAction(async () => {
      const response = await routingService.getRules();
      setRules(response);
      setOkMessage("Reglas de ruteo cargadas.");
    });
  };

  const openCreatePlanModal = () => {
    setPlanDialogContext("area");
    setDraftPlanId("");
    setPlanName("");
    setSelectedOperationalUserId("");
    setSelectedCategorias([]);
    setOriginLat(-34.55);
    setOriginLng(-58.45);
    setDailyByUser(15);
    setDailyByCategory(20);
    setRouteModalPlan(null);
    setSimulation(null);
    setSelectedCrewId("");
    setError(null);
    setOkMessage(null);
  };

  const openEditPlanModal = (plan: RoutingAreaPlan) => {
    hydrateStateFromAreaPlan(plan);
    setPlanDialogContext("area");
    setRouteModalPlan(null);
    setSimulation(null);
    setSelectedCrewId("");
    setError(null);
    setOkMessage(null);
  };

  const openRoutesModal = (plan: RoutingAreaPlan) => {
    hydrateStateFromAreaPlan(plan);
    setPlanDialogContext("routes");
    setRouteModalPlan(plan);
    setSimulation(null);
    setSelectedCrewId("");
    setError(null);
    setOkMessage(null);
  };

  const closeDialogs = () => {
    setPlanDialogContext(null);
    setRouteModalPlan(null);
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

  const buildFastAssignmentPayload = async (plan = buildDraftFromState()): Promise<UpsertRoutingRulesPayload> => {
    if (!Number.isFinite(plan.originLat) || !Number.isFinite(plan.originLng)) {
      throw new Error("Define un origen valido (lat/lng)");
    }
    if (!plan.userId) {
      throw new Error("Selecciona un usuario AGENT para asignar la ruta.");
    }

    const selectedUser = operationalUsers.find((user) => user.id === plan.userId);
    if (!selectedUser) {
      throw new Error("El usuario AGENT seleccionado no esta disponible.");
    }

    const baseRules = rules?.data ?? (await routingService.getRules()).data ?? { categoryRules: [], crews: [], zones: [] };
    const seedSource = baseRules.categoryRules.length > 0 && baseRules.zones.length > 0 ? baseRules : DEFAULT_RULES;
    const effectiveCategoryRules = seedSource.categoryRules
      .filter((rule) => plan.categorias.length === 0 || plan.categorias.includes(rule.categoria))
      .map((rule) => ({ ...rule, cupoDiario: plan.dailyByCategory }));

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
          maxReclamosDiarios: plan.dailyByUser,
          allowedCategorias: effectiveCategoryRules.map((rule) => rule.categoria),
          allowedZoneIds: [],
          startLat: plan.originLat,
          startLng: plan.originLng,
        },
      ],
      zones: sanitizeZones(seedSource.zones ?? []),
    };
  };

  const handleSaveAreaPlan = async () => {
    await runAction(async () => {
      if (!planName.trim()) {
        throw new Error("Asigna un nombre al plan por area.");
      }
      const response = await routingService.saveAreaPlan(buildDraftFromState());
      await loadAreaPlans();
      setDraftPlanId(response.data.id);
      setRouteModalPlan(response.data);
      setOkMessage(`Plan por area guardado: ${response.data.name}`);
      if (planDialogContext === "area") {
        setPlanDialogContext(null);
      }
    });
  };

  const handleSelectAreaPlan = async (plan: RoutingAreaPlan) => {
    await runAction(async () => {
      hydrateStateFromAreaPlan(plan);
      setOkMessage(`Plan seleccionado: ${plan.name}`);
    });
  };

  const handleDeleteAreaPlan = async (planId: string) => {
    await runAction(async () => {
      await routingService.deleteAreaPlan(planId);
      await loadAreaPlans();
      if (draftPlanId === planId) {
        setDraftPlanId("");
      }
      if (routeModalPlan?.id === planId) {
        closeDialogs();
      }
      setOkMessage("Plan por area eliminado.");
    });
  };

  const handleSimulate = async () => {
    await runAction(async () => {
      const overrideRules = await buildFastAssignmentPayload(buildDraftFromState());
      const response = await routingService.simulate({
        maxFetch,
        useGoogleOptimization,
        originLat,
        originLng,
        overrideRules,
      });
      setSimulation(response);
      setSelectedCrewId(response.routes?.[0]?.crewId ?? "");
      if (response.savedPlanId) rememberPlanId(response.savedPlanId);
      setOkMessage("Simulacion ejecutada correctamente.");
    });
  };

  const handleGenerate = async () => {
    await runAction(async () => {
      const overrideRules = await buildFastAssignmentPayload(buildDraftFromState());
      await routingService.upsertRules(overrideRules);
      const response = await routingService.generate({
        maxFetch,
        useGoogleOptimization,
        originLat,
        originLng,
        overrideRules,
      });
      setSimulation(response);
      setSelectedCrewId(response.routes?.[0]?.crewId ?? "");
      if (response.savedPlanId) rememberPlanId(response.savedPlanId);
      await loadRoutePlans();
      setOkMessage(`Plan generado. ID: ${response.savedPlanId ?? "sin id"}`);
    });
  };

  const handleConfirmPlanById = async (planId: string) => {
    await runAction(async () => {
      const result = await routingService.confirmPlan(planId);
      rememberPlanId(planId);
      await loadRoutePlans();
      setOkMessage(result.message || "Plan confirmado.");
    });
  };

  const handleGenerateAndConfirm = async () => {
    await runAction(async () => {
      const payload = await buildFastAssignmentPayload(buildDraftFromState());
      await routingService.upsertRules(payload);
      const generated = await routingService.generate({
        maxFetch,
        useGoogleOptimization,
        originLat,
        originLng,
        overrideRules: payload,
      });
      setSimulation(generated);
      setSelectedCrewId(generated.routes?.[0]?.crewId ?? "");
      if (!generated.savedPlanId) {
        throw new Error("No se pudo obtener planId al generar.");
      }
      rememberPlanId(generated.savedPlanId);
      await loadRoutePlans();
      const confirmation = await routingService.confirmPlan(generated.savedPlanId);
      setOkMessage(`Plan generado y confirmado. ${confirmation.message}`);
    });
  };

  return (
    <section className={styles.stack}>
      <article className={styles.card}>
        <div className={styles.head}>
          <h2>Ruteo operativo</h2>
          <span>{view === "plans" ? "Listado de planes por area" : "Historial de rutas"}</span>
        </div>

        {view === "plans" ? (
          <>
            <div className={styles.toolbarRow}>
              <label className={styles.field} htmlFor="plan-search">
                <span>Buscar plan</span>
                <input
                  id="plan-search"
                  type="text"
                  value={planSearch}
                  onChange={(e) => setPlanSearch(e.target.value)}
                  placeholder="Nombre del plan o usuario"
                />
              </label>

              <label className={styles.field} htmlFor="area-filter">
                <span>Filtrar por area</span>
                <select id="area-filter" className={styles.select} value={selectedAreaFilter} onChange={(e) => setSelectedAreaFilter(e.target.value)}>
                  <option value="all">Todas</option>
                  {availableAreaFilters.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.actionsRow}>
                <button className={styles.buttonPrimary} type="button" onClick={openCreatePlanModal} disabled={loading}>
                  Nueva area
                </button>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Areas</th>
                    <th>Usuario</th>
                    <th>Origen</th>
                    <th>Actualizado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAreaPlans.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No hay planes para los filtros seleccionados.</td>
                    </tr>
                  ) : (
                    visibleAreaPlans.map((plan) => (
                      <tr key={plan.id}>
                        <td>{plan.name}</td>
                        <td>{plan.categorias.length > 0 ? plan.categorias.join(", ") : "Todas"}</td>
                        <td>{plan.userName || plan.userId}</td>
                        <td>{plan.originLat.toFixed(4)}, {plan.originLng.toFixed(4)}</td>
                        <td>{new Date(plan.updatedAt).toLocaleString()}</td>
                        <td>
                          <div className={styles.actionsRow}>
                            <button className={styles.buttonSecondary} type="button" onClick={() => openEditPlanModal(plan)} disabled={loading}>
                              Editar
                            </button>
                            <button className={styles.buttonSecondary} type="button" onClick={() => openRoutesModal(plan)} disabled={loading}>
                              Abrir rutas
                            </button>
                            <button className={styles.buttonSecondary} type="button" onClick={() => void handleDeleteAreaPlan(plan.id)} disabled={loading}>
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
          </>
        ) : (
          <>
            <p className={styles.subtle}>Aqui tienes el historial de planes de ruta generados. Abre uno para revisarlo o confirmarlo.</p>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha plan</th>
                    <th>Estado</th>
                    <th>Asignados</th>
                    <th>No asignados</th>
                    <th>Rutas</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {routePlans.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No hay planes de ruta para los filtros seleccionados.</td>
                    </tr>
                  ) : (
                    routePlans.map((plan) => (
                      <tr key={plan.id}>
                        <td>{new Date(plan.planningDate).toLocaleDateString()}</td>
                        <td>{plan.status}</td>
                        <td>{plan.totalAssigned}</td>
                        <td>{plan.totalUnassigned}</td>
                        <td>{plan.routes.map((route) => `${route.nombre} (${route.assignedClaims})`).join(", ") || "-"}</td>
                        <td>
                          <div className={styles.actionsRow}>
                            <button className={styles.buttonSecondary} type="button" onClick={() => void handleLoadPersistedPlan(plan.id)} disabled={loading}>
                              Abrir
                            </button>
                            <button className={styles.buttonSecondary} type="button" onClick={() => void handleConfirmPlanById(plan.id)} disabled={loading || plan.status === "confirmed"}>
                              Confirmar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {okMessage && <div className={styles.statusOk}>{okMessage}</div>}
        {error && <div className={styles.statusError}>{error}</div>}
      </article>

      {routeModalPlan && view === "plans" && (
        <article className={styles.card}>
          <div className={styles.head}>
            <div>
              <h3>Modulo de rutas</h3>
              <span>{routeModalPlan.name}</span>
            </div>
            <button className={styles.buttonSecondary} type="button" onClick={() => setRouteModalPlan(null)}>
              Cerrar
            </button>
          </div>

          <div className={styles.grid}>
            <div className={styles.metric}>
              <span>Areas</span>
              <strong>{routeModalPlan.categorias.length > 0 ? routeModalPlan.categorias.join(", ") : "Todas"}</strong>
            </div>
            <div className={styles.metric}>
              <span>Usuario</span>
              <strong>{routeModalPlan.userName || routeModalPlan.userId}</strong>
            </div>
            <div className={styles.metric}>
              <span>Origen</span>
              <strong>{routeModalPlan.originLat.toFixed(4)}, {routeModalPlan.originLng.toFixed(4)}</strong>
            </div>
            <div className={styles.metric}>
              <span>Limite diario</span>
              <strong>{routeModalPlan.dailyByUser} / {routeModalPlan.dailyByCategory}</strong>
            </div>
          </div>

          <div className={styles.formSection}>
            <h4 className={styles.sectionTitle}>Configuracion del plan</h4>
            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor="plan-name">
                <span>Nombre del plan</span>
                <input id="plan-name" type="text" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Ej: Plan Alumbrado Norte" />
              </label>
              <label className={styles.field} htmlFor="agent-user-id">
                <span>Usuario operativo</span>
                <select id="agent-user-id" className={styles.select} value={selectedOperationalUserId} onChange={(e) => setSelectedOperationalUserId(e.target.value)}>
                  <option value="">Seleccionar</option>
                  {operationalUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor="origin-lat">
                <span>Punto de origen (latitud)</span>
                <input id="origin-lat" type="number" step="0.000001" value={originLat} onChange={(e) => setOriginLat(Number(e.target.value || 0))} />
              </label>
              <label className={styles.field} htmlFor="origin-lng">
                <span>Punto de origen (longitud)</span>
                <input id="origin-lng" type="number" step="0.000001" value={originLng} onChange={(e) => setOriginLng(Number(e.target.value || 0))} />
              </label>
              <label className={styles.field} htmlFor="daily-by-user">
                <span>Reclamos diarios por usuario</span>
                <input id="daily-by-user" type="number" min={1} value={dailyByUser} onChange={(e) => setDailyByUser(Number(e.target.value || 1))} />
              </label>
              <label className={styles.field} htmlFor="daily-by-category">
                <span>Reclamos diarios por area</span>
                <input id="daily-by-category" type="number" min={1} value={dailyByCategory} onChange={(e) => setDailyByCategory(Number(e.target.value || 1))} />
              </label>
            </div>

            <div className={styles.formSection}>
              <h5 className={styles.sectionTitle}>Areas de reclamo</h5>
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
                            e.target.checked ? [...current, categoria] : current.filter((item) => item !== categoria),
                          );
                        }}
                      />
                      <span>{categoria}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className={styles.actionsRow}>
              <button className={styles.buttonSecondary} type="button" onClick={handleSearchOrigin} disabled={loading}>
                Buscar origen
              </button>
              <button className={styles.buttonSecondary} type="button" onClick={handleSaveAreaPlan} disabled={loading}>
                Guardar cambios
              </button>
              <button className={styles.buttonSecondary} type="button" onClick={handleLoadRules} disabled={loading}>
                Recargar reglas
              </button>
            </div>
          </div>

          <div className={styles.formSection}>
            <h4 className={styles.sectionTitle}>Generacion de rutas</h4>
            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor="max-fetch">
                <span>Maximo de reclamos a evaluar</span>
                <input id="max-fetch" type="number" min={50} max={5000} value={maxFetch} onChange={(e) => setMaxFetch(Number(e.target.value || 200))} />
              </label>
              <label className={styles.checkbox} htmlFor="google-optimize">
                <input id="google-optimize" type="checkbox" checked={useGoogleOptimization} onChange={(e) => setUseGoogleOptimization(e.target.checked)} />
                Usar optimizacion de Google
              </label>
            </div>

            <div className={styles.actionsRow}>
              <button className={styles.buttonPrimary} type="button" onClick={handleSimulate} disabled={loading}>
                Simular ruta
              </button>
              <button className={styles.buttonPrimary} type="button" onClick={handleGenerate} disabled={loading}>
                Generar ruta
              </button>
              <button className={styles.buttonPrimary} type="button" onClick={handleGenerateAndConfirm} disabled={loading}>
                Generar y confirmar ruta
              </button>
            </div>
          </div>

          {simulation && (
            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Resultado de ruteo</h4>
              <div className={styles.grid}>
                <div className={styles.metric}><span>Reclamos leidos</span><strong>{simulation.summary.totalFetched}</strong></div>
                <div className={styles.metric}><span>Asignados</span><strong>{simulation.summary.totalAssigned}</strong></div>
                <div className={styles.metric}><span>No asignados</span><strong>{simulation.summary.totalUnassigned}</strong></div>
                <div className={styles.metric}><span>Google optimize</span><strong>{simulation.summary.googleOptimization.enabled ? `${simulation.summary.googleOptimization.optimizedRoutes} optimizadas` : "desactivado"}</strong></div>
              </div>

              {Object.keys(simulation.summary.unassignedByReason).length > 0 && (
                <div className={styles.formSection}>
                  <h5 className={styles.sectionTitle}>Diagnostico de no asignacion</h5>
                  <div className={styles.grid}>
                    {Object.entries(simulation.summary.unassignedByReason).map(([reason, count]) => (
                      <div key={reason} className={styles.metric}>
                        <span>{humanizeReason(reason)}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Reclamo</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulation.unassigned.map((item) => (
                          <tr key={`${item.reclamoId}-${item.reason}`}>
                            <td>{item.reclamoId}</td>
                            <td>{humanizeReason(item.reason)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className={styles.routePickerWrap}>
                <label htmlFor="route-picker" className={styles.subtle}>Ruta a visualizar</label>
                <select id="route-picker" className={styles.select} value={selectedRoute?.crewId ?? ""} onChange={(e) => setSelectedCrewId(e.target.value)}>
                  {simulation.routes.map((route) => (
                    <option key={route.crewId} value={route.crewId}>
                      {route.nombre} ({route.assignedClaims} reclamos)
                    </option>
                  ))}
                </select>
              </div>

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
                      <th>Usuario operativo</th>
                      <th>Sec.</th>
                      <th>Reclamo</th>
                      <th>Categoria</th>
                      <th>Dist. tramo (km)</th>
                      <th>Dur. tramo (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topStops.length === 0 ? (
                      <tr><td colSpan={6}>No hay paradas en la simulacion.</td></tr>
                    ) : (
                      topStops.map((stop) => (
                        <tr key={`${stop.crewId}-${stop.reclamoId}-${stop.sequence}`}>
                          <td>{stop.crewName}</td>
                          <td>{stop.sequence}</td>
                          <td>{stop.reclamoId}</td>
                          <td>{stop.categoria}</td>
                          <td>{stop.distanceFromPreviousKm}</td>
                          <td>{stop.durationFromPreviousMin}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className={styles.mapWrap}>
                {!selectedRoute && <p className={styles.subtle}>No hay ruta seleccionada.</p>}
                {selectedRoute && selectedRoute.stops.length < 2 && <p className={styles.subtle}>Se necesitan al menos 2 paradas para visualizar una ruta en el mapa.</p>}
                {selectedRoute && selectedRoute.stops.length >= 2 && mapUrl && (
                  <iframe title={`Mapa de ruta ${selectedRoute.nombre}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                )}
              </div>
            </div>
          )}
        </article>
      )}

      {planDialogContext === "area" && (
        <div className={styles.modalBackdrop} role="presentation" onClick={closeDialogs}>
          <div className={styles.modalPanel} role="dialog" aria-modal="true" aria-labelledby="area-plan-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 id="area-plan-modal-title">{draftPlanId ? "Editar area" : "Nueva area"}</h3>
                <p className={styles.subtle}>Crea o ajusta el plan de area antes de abrir el modulo de rutas.</p>
              </div>
              <button className={styles.buttonSecondary} type="button" onClick={closeDialogs}>
                Cerrar
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.fieldGrid}>
                <label className={styles.field} htmlFor="modal-plan-name">
                  <span>Nombre del plan</span>
                  <input id="modal-plan-name" type="text" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Ej: Plan Alumbrado Norte" />
                </label>
                <label className={styles.field} htmlFor="modal-agent-user-id">
                  <span>Usuario operativo</span>
                  <select id="modal-agent-user-id" className={styles.select} value={selectedOperationalUserId} onChange={(e) => setSelectedOperationalUserId(e.target.value)}>
                    <option value="">Seleccionar</option>
                    {operationalUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field} htmlFor="modal-origin-lat">
                  <span>Punto de origen (latitud)</span>
                  <input id="modal-origin-lat" type="number" step="0.000001" value={originLat} onChange={(e) => setOriginLat(Number(e.target.value || 0))} />
                </label>
                <label className={styles.field} htmlFor="modal-origin-lng">
                  <span>Punto de origen (longitud)</span>
                  <input id="modal-origin-lng" type="number" step="0.000001" value={originLng} onChange={(e) => setOriginLng(Number(e.target.value || 0))} />
                </label>
                <label className={styles.field} htmlFor="modal-daily-by-user">
                  <span>Reclamos diarios por usuario</span>
                  <input id="modal-daily-by-user" type="number" min={1} value={dailyByUser} onChange={(e) => setDailyByUser(Number(e.target.value || 1))} />
                </label>
                <label className={styles.field} htmlFor="modal-daily-by-category">
                  <span>Reclamos diarios por area</span>
                  <input id="modal-daily-by-category" type="number" min={1} value={dailyByCategory} onChange={(e) => setDailyByCategory(Number(e.target.value || 1))} />
                </label>
              </div>

              <div className={styles.formSection}>
                <h5 className={styles.sectionTitle}>Areas de reclamo</h5>
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
                              e.target.checked ? [...current, categoria] : current.filter((item) => item !== categoria),
                            );
                          }}
                        />
                        <span>{categoria}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className={styles.actionsRow}>
                <button className={styles.buttonSecondary} type="button" onClick={handleSearchOrigin} disabled={loading}>
                  Buscar origen
                </button>
                <button className={styles.buttonPrimary} type="button" onClick={handleSaveAreaPlan} disabled={loading}>
                  Guardar area
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {routeModalPlan && view === "plans" && (
        <article className={styles.card}>
          <div className={styles.head}>
            <div>
              <h3>Modulo de rutas</h3>
              <span>{routeModalPlan.name}</span>
            </div>
            <button className={styles.buttonSecondary} type="button" onClick={() => setRouteModalPlan(null)}>
              Cerrar modulo
            </button>
          </div>

          <div className={styles.grid}>
            <div className={styles.metric}>
              <span>Areas</span>
              <strong>{routeModalPlan.categorias.length > 0 ? routeModalPlan.categorias.join(", ") : "Todas"}</strong>
            </div>
            <div className={styles.metric}>
              <span>Usuario</span>
              <strong>{routeModalPlan.userName || routeModalPlan.userId}</strong>
            </div>
            <div className={styles.metric}>
              <span>Origen</span>
              <strong>{routeModalPlan.originLat.toFixed(4)}, {routeModalPlan.originLng.toFixed(4)}</strong>
            </div>
            <div className={styles.metric}>
              <span>Limite diario</span>
              <strong>{routeModalPlan.dailyByUser} / {routeModalPlan.dailyByCategory}</strong>
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.buttonPrimary} type="button" onClick={handleSimulate} disabled={loading}>
              Simular ruta
            </button>
            <button className={styles.buttonPrimary} type="button" onClick={handleGenerate} disabled={loading}>
              Generar ruta
            </button>
            <button className={styles.buttonPrimary} type="button" onClick={handleGenerateAndConfirm} disabled={loading}>
              Generar y confirmar ruta
            </button>
          </div>

          <p className={styles.subtle}>Si necesitas cambiar el nombre, usuario, areas o limites, usa el boton Editar en la tabla.</p>

          {simulation && (
            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Resultado de ruteo</h4>
              <div className={styles.grid}>
                <div className={styles.metric}><span>Reclamos leidos</span><strong>{simulation.summary.totalFetched}</strong></div>
                <div className={styles.metric}><span>Asignados</span><strong>{simulation.summary.totalAssigned}</strong></div>
                <div className={styles.metric}><span>No asignados</span><strong>{simulation.summary.totalUnassigned}</strong></div>
                <div className={styles.metric}><span>Google optimize</span><strong>{simulation.summary.googleOptimization.enabled ? `${simulation.summary.googleOptimization.optimizedRoutes} optimizadas` : "desactivado"}</strong></div>
              </div>

              {Object.keys(simulation.summary.unassignedByReason).length > 0 && (
                <div className={styles.formSection}>
                  <h5 className={styles.sectionTitle}>Diagnostico de no asignacion</h5>
                  <div className={styles.grid}>
                    {Object.entries(simulation.summary.unassignedByReason).map(([reason, count]) => (
                      <div key={reason} className={styles.metric}>
                        <span>{humanizeReason(reason)}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Reclamo</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulation.unassigned.map((item) => (
                          <tr key={`${item.reclamoId}-${item.reason}`}>
                            <td>{item.reclamoId}</td>
                            <td>{humanizeReason(item.reason)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className={styles.routePickerWrap}>
                <label htmlFor="route-picker" className={styles.subtle}>Ruta a visualizar</label>
                <select id="route-picker" className={styles.select} value={selectedRoute?.crewId ?? ""} onChange={(e) => setSelectedCrewId(e.target.value)}>
                  {simulation.routes.map((route) => (
                    <option key={route.crewId} value={route.crewId}>
                      {route.nombre} ({route.assignedClaims} reclamos)
                    </option>
                  ))}
                </select>
              </div>

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
                      <th>Usuario operativo</th>
                      <th>Sec.</th>
                      <th>Reclamo</th>
                      <th>Categoria</th>
                      <th>Dist. tramo (km)</th>
                      <th>Dur. tramo (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topStops.length === 0 ? (
                      <tr><td colSpan={6}>No hay paradas en la simulacion.</td></tr>
                    ) : (
                      topStops.map((stop) => (
                        <tr key={`${stop.crewId}-${stop.reclamoId}-${stop.sequence}`}>
                          <td>{stop.crewName}</td>
                          <td>{stop.sequence}</td>
                          <td>{stop.reclamoId}</td>
                          <td>{stop.categoria}</td>
                          <td>{stop.distanceFromPreviousKm}</td>
                          <td>{stop.durationFromPreviousMin}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className={styles.mapWrap}>
                {!selectedRoute && <p className={styles.subtle}>No hay ruta seleccionada.</p>}
                {selectedRoute && selectedRoute.stops.length < 2 && <p className={styles.subtle}>Se necesitan al menos 2 paradas para visualizar una ruta en el mapa.</p>}
                {selectedRoute && selectedRoute.stops.length >= 2 && mapUrl && (
                  <iframe title={`Mapa de ruta ${selectedRoute.nombre}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                )}
              </div>
            </div>
          )}
        </article>
      )}

      {rules && (
        <article className={styles.card}>
          <div className={styles.head}>
            <h3>Reglas vigentes</h3>
            <span>{rules.data.categoryRules.length} categorias - {rules.data.crews.length} usuarios operativos - {rules.data.zones.length} zonas</span>
          </div>
        </article>
      )}
    </section>
  );
}
