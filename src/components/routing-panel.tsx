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
const ROUTING_ACTIVE_AREA_PLAN_ID_KEY = "routing:activeAreaPlanId";
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

type RoutingAreaPlanDraft = Omit<RoutingAreaPlan, "createdAt" | "updatedAt">;

type RoutingPanelView = "plans" | "new" | "routes";

type RoutingPanelProps = {
  view?: RoutingPanelView;
};

export function RoutingPanel({ view = "routes" }: RoutingPanelProps) {
  const isPlansView = view === "plans";
  const isNewPlanView = view === "new";
  const isRoutesView = view === "routes";
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
  const [planName, setPlanName] = useState<string>("");
  const [savedAreaPlans, setSavedAreaPlans] = useState<RoutingAreaPlan[]>([]);
  const [activeAreaPlanId, setActiveAreaPlanId] = useState<string>("");
  const [routePlans, setRoutePlans] = useState<RoutingPlanListItem[]>([]);

  const humanizeReason = (reason: string): string => {
    const dictionary: Record<string, string> = {
      category_quota_reached: "Cupo de categoria alcanzado",
      no_eligible_crew: "Sin usuario operativo elegible",
    };
    return dictionary[reason] ?? reason;
  };

  const activeAreaPlan = useMemo(
    () => savedAreaPlans.find((plan) => plan.id === activeAreaPlanId) ?? null,
    [activeAreaPlanId, savedAreaPlans],
  );

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

  const hydrateStateFromAreaPlan = (plan: Pick<RoutingAreaPlan, "id" | "name" | "userId" | "categorias" | "originLat" | "originLng" | "dailyByUser" | "dailyByCategory">) => {
    setPlanName(plan.name);
    setSelectedOperationalUserId(plan.userId);
    setSelectedCategorias(plan.categorias);
    setOriginLat(plan.originLat);
    setOriginLng(plan.originLng);
    setDailyByUser(plan.dailyByUser);
    setDailyByCategory(plan.dailyByCategory);
    setActiveAreaPlanId(plan.id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ROUTING_ACTIVE_AREA_PLAN_ID_KEY, plan.id);
    }
  };

  const hydrateFormFromRules = (source: RoutingRulesResponse["data"], agentUsers: ManagedUser[] = operationalUsers) => {
    setPlanName("Plan activo persistido");
    if (source.categoryRules.length > 0) {
      setSelectedCategorias(source.categoryRules.map((rule) => rule.categoria));
      setDailyByCategory(source.categoryRules[0].cupoDiario);
    }
    if (source.crews.length > 0) {
      const firstCrew = source.crews[0];
      setDailyByUser(firstCrew.maxReclamosDiarios);
      if (typeof firstCrew.startLat === "number") setOriginLat(firstCrew.startLat);
      if (typeof firstCrew.startLng === "number") setOriginLng(firstCrew.startLng);
      const assigneeId = firstCrew.userId ?? firstCrew.crewId;
      if (assigneeId && agentUsers.some((user) => user.id === assigneeId)) {
        setSelectedOperationalUserId(assigneeId);
      }
    }
  };

  const buildDraftFromState = (): RoutingAreaPlanDraft => ({
    id: activeAreaPlanId || crypto.randomUUID(),
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

    const rememberedPlanId =
      preferredPlanId ??
      (typeof window !== "undefined" ? window.localStorage.getItem(ROUTING_ACTIVE_AREA_PLAN_ID_KEY) ?? "" : "");
    const selectedPlan = response.data.find((plan) => plan.id === rememberedPlanId) ?? response.data[0] ?? null;
    if (selectedPlan) {
      hydrateStateFromAreaPlan(selectedPlan);
    }
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
        hydrateFormFromRules(rulesResponse.data, agentUsers);

        if (typeof window !== "undefined") {
          const activePlanId = window.localStorage.getItem(ROUTING_ACTIVE_AREA_PLAN_ID_KEY) ?? "";
          const selectedPlan = areaPlansResponse.data.find((plan) => plan.id === activePlanId) ?? areaPlansResponse.data[0] ?? null;
          if (selectedPlan) {
            hydrateStateFromAreaPlan(selectedPlan);
          } else if (agentUsers.length > 0) {
            const persistedAssigneeId = rulesResponse.data.crews[0]?.userId ?? rulesResponse.data.crews[0]?.crewId;
            setSelectedOperationalUserId(
              persistedAssigneeId && agentUsers.some((user) => user.id === persistedAssigneeId)
                ? persistedAssigneeId
                : (agentUsers[0]?.id ?? ""),
            );
          }

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
      hydrateFormFromRules(response.data);
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
      await loadAreaPlans(response.data.id);
      setOkMessage(`Plan por area guardado: ${response.data.name}`);
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
      const nextActiveId = activeAreaPlanId === planId ? "" : activeAreaPlanId;
      await routingService.deleteAreaPlan(planId);
      await loadAreaPlans(nextActiveId);
      setOkMessage("Plan por area eliminado.");
    });
  };

  const handleApplyBasicConfig = async () => {
    await runAction(async () => {
      const payload = await buildFastAssignmentPayload();
      await routingService.upsertRules(payload);
      const refreshed = await routingService.getRules();
      setRules(refreshed);
      setOkMessage("Plan activo aplicado a reglas de ruteo.");
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
          <span>
            {isPlansView
              ? "Planes por area"
              : isNewPlanView
                ? "Crear un nuevo plan"
                : "Rutas y asignaciones"}
          </span>
        </div>

        {!isRoutesView && (
        <div className={styles.formSection}>
          <h4 className={styles.sectionTitle}>Modulo 1: Planes por area</h4>
          <p className={styles.subtle}>
            Aqui defines y guardas planes reutilizables en backend. Luego eliges uno en el modulo de rutas para generar el recorrido.
          </p>

          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="plan-name">
              <span>Nombre del plan</span>
              <input id="plan-name" type="text" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Ej: Plan Alumbrado Norte" />
            </label>
          </div>

          <div className={styles.formSection}>
            <h5 className={styles.sectionTitle}>Usuario AGENT</h5>
            {operationalUsers.length === 0 ? (
              <p className={styles.subtle}>No hay usuarios activos con rol AGENT disponibles.</p>
            ) : (
              <label className={styles.field} htmlFor="agent-user-id">
                <span>Usuario operativo</span>
                <select id="agent-user-id" className={styles.select} value={selectedOperationalUserId} onChange={(e) => setSelectedOperationalUserId(e.target.value)}>
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

          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="origin-query">
              <span>Buscar punto de origen por direccion</span>
              <input id="origin-query" type="text" value={originQuery} onChange={(e) => setOriginQuery(e.target.value)} placeholder="Ej: Av. Corrientes 1000, Buenos Aires" />
            </label>
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.buttonSecondary} type="button" onClick={handleSearchOrigin} disabled={loading}>
              Buscar origen
            </button>
            {originFormattedAddress && <span className={styles.subtle}>Origen detectado: {originFormattedAddress}</span>}
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

          <div className={styles.actionsRow}>
            <button className={styles.buttonSecondary} type="button" onClick={handleSaveAreaPlan} disabled={loading}>
              Guardar plan por area
            </button>
            <button className={styles.buttonSecondary} type="button" onClick={handleApplyBasicConfig} disabled={loading}>
              Aplicar plan activo
            </button>
            <button className={styles.buttonSecondary} type="button" onClick={handleLoadRules} disabled={loading}>
              Recargar reglas guardadas
            </button>
          </div>

          {isPlansView && (
          <div className={styles.formSection}>
            <h5 className={styles.sectionTitle}>Planes guardados</h5>
            {savedAreaPlans.length === 0 ? (
              <p className={styles.subtle}>Aun no hay planes por area guardados.</p>
            ) : (
              <div className={styles.grid}>
                {savedAreaPlans.map((plan) => (
                  <div key={plan.id} className={styles.planCard} data-active={plan.id === activeAreaPlanId}>
                    <strong>{plan.name}</strong>
                    <span className={styles.subtle}>{plan.categorias.length > 0 ? plan.categorias.join(", ") : "Todas las categorias"}</span>
                    <span className={styles.subtle}>Actualizado: {new Date(plan.updatedAt).toLocaleString()}</span>
                    <div className={styles.actionsRow}>
                      <button className={styles.buttonSecondary} type="button" onClick={() => void handleSelectAreaPlan(plan)} disabled={loading}>
                        Seleccionar
                      </button>
                      <button className={styles.buttonSecondary} type="button" onClick={() => void handleDeleteAreaPlan(plan.id)} disabled={loading}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          <div className={styles.mapWrap}>
            {originMapUrl && <iframe title="Mapa de punto de origen" src={originMapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />}
          </div>
        </div>
        )}

        {isRoutesView && (
        <div className={styles.formSection}>
          <h4 className={styles.sectionTitle}>Modulo 2: Rutas</h4>
          <p className={styles.subtle}>Elige un plan guardado y genera la ruta usando ese plan como configuracion activa.</p>

          <div className={styles.metric}>
            <span>Plan seleccionado</span>
            <strong>{activeAreaPlan?.name || planName || "Sin plan seleccionado"}</strong>
          </div>

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

          <div className={styles.formSection}>
            <h5 className={styles.sectionTitle}>Historial de rutas generadas</h5>
            {routePlans.length === 0 ? (
              <p className={styles.subtle}>Todavia no hay planes de ruta persistidos.</p>
            ) : (
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
                    {routePlans.map((plan) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}

        {isRoutesView && (
        <div className={styles.formSection}>
          <h4 className={styles.sectionTitle}>Confirmacion manual</h4>
          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="plan-id">
              <span>Plan ID</span>
              <input id="plan-id" type="text" placeholder="UUID del plan" value={lastPlanId} onChange={(e) => setLastPlanId(e.target.value)} />
            </label>
          </div>
          <div className={styles.actionsRow}>
            <button className={styles.buttonSecondary} type="button" onClick={handleConfirmPlan} disabled={loading}>
              Confirmar plan
            </button>
          </div>
        </div>
        )}

        {okMessage && <div className={styles.statusOk}>{okMessage}</div>}
        {error && <div className={styles.statusError}>{error}</div>}
      </article>

      {rules && (
        <article className={styles.card}>
          <div className={styles.head}>
            <h3>Reglas vigentes</h3>
            <span>{rules.data.categoryRules.length} categorias · {rules.data.crews.length} usuarios operativos · {rules.data.zones.length} zonas</span>
          </div>
          <p className={styles.subtle}>Estas reglas siguen siendo la configuracion persistida activa en backend.</p>
        </article>
      )}

      {isRoutesView && simulation && (
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
              <strong>{simulation.summary.googleOptimization.enabled ? `${simulation.summary.googleOptimization.optimizedRoutes} optimizadas` : "desactivado"}</strong>
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
              <p className={styles.subtle}>Este resumen ayuda a entender por que algunos reclamos no entraron en la ruta.</p>
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
            {selectedRoute && selectedRoute.stops.length < 2 && <p className={styles.subtle}>Se necesitan al menos 2 paradas para visualizar una ruta en el mapa.</p>}
            {selectedRoute && selectedRoute.stops.length >= 2 && mapUrl && (
              <iframe title={`Mapa de ruta ${selectedRoute.nombre}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            )}
          </div>
        </article>
      )}
    </section>
  );
}
