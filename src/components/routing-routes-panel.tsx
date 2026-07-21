"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accessControlService, type ManagedUser } from "@/services/access-control.service";
import { CATEGORIA_LABELS } from "@/services/reclamos.service";
import {
  routingService,
  type RoutingAreaPlan,
  type RoutingCategoryRule,
  type RoutingRulesResponse,
  type RoutingSimulationResult,
  type RoutingZoneRule,
  type UpsertRoutingRulesPayload,
} from "@/services/routing.service";
import styles from "./routing-panel.module.css";

type AreaFilter = "all" | RoutingCategoryRule["categoria"];

const FALLBACK_CATEGORIES = [
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
] as const;

const CATEGORY_ALIASES: Record<string, (typeof FALLBACK_CATEGORIES)[number]> = {
  agua_y_cloacas: "agua_y_cloacas",
  aguas_y_cloacas: "agua_y_cloacas",
  agua_cloacas: "agua_y_cloacas",
  aguas_cloacas: "agua_y_cloacas",
  alumbrado: "alumbrado",
  baches_y_pavimento: "baches_y_pavimento",
  baches_pavimento: "baches_y_pavimento",
  arbolado: "arbolado",
  residuos: "residuos",
  electricidad: "electricidad",
  gas: "gas",
  transporte: "transporte",
  infraestructura: "infraestructura",
  otros: "otros",
};

const DEFAULT_RULES: UpsertRoutingRulesPayload = {
  categoryRules: FALLBACK_CATEGORIES.map((categoria) => ({ categoria, cupoDiario: 20, pesoPrioridad: 1 })),
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

function getCategoryLabel(value: string): string {
  const normalizedCategory = normalizeCategory(value);
  if (normalizedCategory) {
    return CATEGORIA_LABELS[normalizedCategory];
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type PreflightStatus = "ok" | "error" | "warning";

type PreflightCheck = {
  key: string;
  label: string;
  status: PreflightStatus;
  detail: string;
};

type AuditEntry = {
  id: string;
  at: string;
  action: string;
  outcome: "ok" | "error" | "info";
  detail: string;
};

type RunQualitySnapshot = {
  id: string;
  at: string;
  planId: string | null;
  withGoogle: boolean;
  fallbackUsed: boolean;
  totalFetched: number;
  totalAssigned: number;
  totalUnassigned: number;
  assignmentRate: number;
  totalDistanceKm: number;
  totalDurationMin: number;
};

type ToastMessage = {
  id: string;
  kind: "success" | "error" | "info";
  text: string;
};

type OperationStage = "borrador" | "validado" | "confirmado" | "despachado" | "cerrado";

const OPERATION_STAGE_LABELS: Record<OperationStage, string> = {
  borrador: "Borrador",
  validado: "Validado",
  confirmado: "Confirmado",
  despachado: "Despachado",
  cerrado: "Cerrado",
};

function getUnassignedSuggestion(reason: string): string {
  const normalized = reason.toLowerCase();

  if (normalized.includes("categoria") || normalized.includes("category")) {
    return "Revisa categorias habilitadas en el plan y en allowedCategorias del usuario operativo.";
  }

  if (normalized.includes("cupo") || normalized.includes("quota") || normalized.includes("maximo")) {
    return "Aumenta cupos por categoria o por usuario para esta corrida.";
  }

  if (normalized.includes("zona") || normalized.includes("zone")) {
    return "Verifica reglas de zonas y la cobertura geografica de la cuadrilla.";
  }

  if (normalized.includes("usuario") || normalized.includes("crew") || normalized.includes("agent")) {
    return "Asigna otro usuario operativo o amplia capacidad de la cuadrilla actual.";
  }

  return "Revisa reglas de corrida y parametros del plan antes de regenerar.";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function RoutingRoutesPanel() {
  const [plans, setPlans] = useState<RoutingAreaPlan[]>([]);
  const [agentUsers, setAgentUsers] = useState<ManagedUser[]>([]);
  const [rules, setRules] = useState<RoutingRulesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaFilter>("all");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [maxFetch, setMaxFetch] = useState<number>(200);
  const [useGoogleOptimization, setUseGoogleOptimization] = useState<boolean>(true);
  const [persistGlobalRules, setPersistGlobalRules] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [stepDirection, setStepDirection] = useState<"forward" | "backward">("forward");
  const [coverageEstimate, setCoverageEstimate] = useState<RoutingSimulationResult | null>(null);
  const [loadedClaims, setLoadedClaims] = useState<RoutingSimulationResult | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<RoutingSimulationResult | null>(null);
  const [operationStage, setOperationStage] = useState<OperationStage>("borrador");
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [runHistory, setRunHistory] = useState<RunQualitySnapshot[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const lastErrorToastRef = useRef<string | null>(null);
  const lastOkToastRef = useRef<string | null>(null);

  const pushToast = (kind: ToastMessage["kind"], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, kind, text }].slice(-4));
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3800);
  };

  const goToStep = (nextStep: 1 | 2 | 3 | 4) => {
    setStepDirection(nextStep >= wizardStep ? "forward" : "backward");
    setWizardStep(nextStep);
  };

  const logAudit = (entry: Omit<AuditEntry, "id" | "at">) => {
    const next: AuditEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...entry,
    };

    setAuditTrail((current) => [next, ...current].slice(0, 30));
  };

  const availableAreas = useMemo(() => {
    const areas = new Set<RoutingCategoryRule["categoria"]>();
    for (const plan of plans) {
      for (const categoria of getPlanCategories(plan)) {
        areas.add(categoria);
      }
    }
    return Array.from(areas).sort();
  }, [plans]);

  const visiblePlans = useMemo(() => {
    return plans.filter((plan) => {
      if (selectedArea === "all") {
        return true;
      }

      return getPlanCategories(plan).includes(selectedArea);
    });
  }, [plans, selectedArea]);

  const selectedPlan = useMemo(() => {
    return plans.find((plan) => plan.id === selectedPlanId) ?? null;
  }, [plans, selectedPlanId]);

  const selectedRoute = useMemo(() => {
    if (!generatedPlan?.routes?.length) return null;
    if (!selectedCrewId) return generatedPlan.routes[0];
    return generatedPlan.routes.find((route) => route.crewId === selectedCrewId) ?? generatedPlan.routes[0];
  }, [generatedPlan, selectedCrewId]);

  const maxUnlockedStep = useMemo<1 | 2 | 3 | 4>(() => {
    if (generatedPlan) {
      return 4;
    }

    if (loadedClaims && selectedPlan) {
      return 3;
    }

    if (selectedPlan) {
      return 2;
    }

    return 1;
  }, [generatedPlan, loadedClaims, selectedPlan]);

  const visibleStops = useMemo(() => {
    return selectedRoute?.stops ?? [];
  }, [selectedRoute]);

  const preflightChecks = useMemo<PreflightCheck[]>(() => {
    if (!selectedPlan) {
      return [];
    }

    const planCategories = getPlanCategories(selectedPlan);
    const hasCategories = planCategories.length > 0;

    const selectedUser = agentUsers.find((user) => user.id === selectedPlan.userId);
    const hasActiveUser = Boolean(selectedUser);

    const hasValidDailyByUser = Number.isFinite(selectedPlan.dailyByUser) && selectedPlan.dailyByUser > 0;
    const hasValidDailyByCategory = Number.isFinite(selectedPlan.dailyByCategory) && selectedPlan.dailyByCategory > 0;

    const hasValidOrigin =
      Number.isFinite(selectedPlan.originLat) &&
      Number.isFinite(selectedPlan.originLng) &&
      Math.abs(selectedPlan.originLat) <= 90 &&
      Math.abs(selectedPlan.originLng) <= 180;

    const hasConfiguredRules =
      Boolean(rules?.data.categoryRules.length) &&
      Boolean(rules?.data.zones.length);

    return [
      {
        key: "categories",
        label: "Categorias del plan",
        status: hasCategories ? "ok" : "error",
        detail: hasCategories
          ? `${planCategories.map((categoria) => getCategoryLabel(categoria)).join(", ")}`
          : "No hay categorias canonicas validas para ruteo.",
      },
      {
        key: "user",
        label: "Usuario operativo activo",
        status: hasActiveUser ? "ok" : "error",
        detail: hasActiveUser
          ? `${selectedUser?.name || selectedUser?.email}`
          : "El usuario base del plan no esta activo o no tiene rol AGENT.",
      },
      {
        key: "quota",
        label: "Cupos configurados",
        status: hasValidDailyByUser && hasValidDailyByCategory ? "ok" : "error",
        detail:
          hasValidDailyByUser && hasValidDailyByCategory
            ? `Usuario: ${selectedPlan.dailyByUser} · Categoria: ${selectedPlan.dailyByCategory}`
            : "Los cupos por usuario y por categoria deben ser mayores que 0.",
      },
      {
        key: "origin",
        label: "Origen georreferenciado",
        status: hasValidOrigin ? "ok" : "error",
        detail: hasValidOrigin
          ? `${selectedPlan.originLat.toFixed(6)}, ${selectedPlan.originLng.toFixed(6)}`
          : "Latitud/longitud invalidas o fuera de rango.",
      },
      {
        key: "rules",
        label: "Reglas y zonas disponibles",
        status: hasConfiguredRules ? "ok" : "warning",
        detail: hasConfiguredRules
          ? "Se usaran reglas configuradas en el sistema."
          : "No hay reglas completas cargadas; se aplicara fallback por defecto.",
      },
    ];
  }, [agentUsers, rules, selectedPlan]);

  const hasPreflightBlockingErrors = preflightChecks.some((check) => check.status === "error");

  const loadedUnassignedByReason = useMemo(() => {
    return Object.entries(loadedClaims?.summary.unassignedByReason ?? {});
  }, [loadedClaims]);

  const generatedUnassignedByReason = useMemo(() => {
    return Object.entries(generatedPlan?.summary.unassignedByReason ?? {});
  }, [generatedPlan]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, []);

  useEffect(() => {
    if (!error || error === lastErrorToastRef.current) {
      return;
    }

    lastErrorToastRef.current = error;
    pushToast("error", error);
  }, [error]);

  useEffect(() => {
    if (!okMessage || okMessage === lastOkToastRef.current) {
      return;
    }

    lastOkToastRef.current = okMessage;
    pushToast("success", okMessage);
  }, [okMessage]);

  const resetWizard = () => {
    setSelectedArea("all");
    setSelectedPlanId("");
    setSelectedUserId("");
    setMaxFetch(200);
    setUseGoogleOptimization(true);
    setPersistGlobalRules(false);
    goToStep(1);
    setCoverageEstimate(null);
    setLoadedClaims(null);
    setGeneratedPlan(null);
    setOperationStage("borrador");
    setSelectedCrewId("");
    setAuditTrail([]);
    setRunHistory([]);
    setError(null);
    setOkMessage(null);
  };

  const buildPayload = async (plan: RoutingAreaPlan, userId: string): Promise<UpsertRoutingRulesPayload> => {
    const selectedUser = agentUsers.find((user) => user.id === userId);
    if (!selectedUser) {
      throw new Error("Selecciona un usuario operativo valido.");
    }

    const planCategories = getPlanCategories(plan);
    if (planCategories.length === 0) {
      throw new Error("El plan seleccionado no tiene categorias validas para ruteo.");
    }

    const baseRules = rules?.data ?? (await routingService.getRules()).data ?? { categoryRules: [], crews: [], zones: [] };
    const seedSource = baseRules.categoryRules.length > 0 && baseRules.zones.length > 0 ? baseRules : DEFAULT_RULES;
    const sourceByCategory = new Map<RoutingCategoryRule["categoria"], RoutingCategoryRule>();

    for (const rule of seedSource.categoryRules) {
      const normalizedCategory = normalizeCategory(rule.categoria);
      if (!normalizedCategory || sourceByCategory.has(normalizedCategory)) {
        continue;
      }

      sourceByCategory.set(normalizedCategory, {
        categoria: normalizedCategory,
        cupoDiario: rule.cupoDiario,
        pesoPrioridad: rule.pesoPrioridad,
      });
    }

    const categoryRules: RoutingCategoryRule[] = planCategories.map((categoria) => {
      const sourceRule = sourceByCategory.get(categoria);
      return {
        categoria,
        cupoDiario: plan.dailyByCategory,
        pesoPrioridad: sourceRule?.pesoPrioridad ?? 1,
      };
    });

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

    if (hasPreflightBlockingErrors) {
      setError("Corrige los puntos marcados en la validacion previa antes de continuar al paso 2.");
      logAudit({
        action: "validacion_previa",
        outcome: "error",
        detail: "Se intento avanzar al paso 2 con errores bloqueantes.",
      });
      return;
    }

    setError(null);
    setOkMessage(`Plan listo para cargar reclamos: ${selectedPlan.name}`);
    if (!selectedUserId) {
      setSelectedUserId(selectedPlan.userId);
    }
    setCoverageEstimate(null);
    setLoadedClaims(null);
    goToStep(2);
    logAudit({
      action: "validacion_previa",
      outcome: "ok",
      detail: `Plan ${selectedPlan.name} listo para carga de reclamos.`,
    });
  };

  const handleEstimateCoverage = async () => {
    if (!selectedPlan) {
      setError("Selecciona un plan para estimar cobertura.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      const payload = await buildPayload(selectedPlan, selectedPlan.userId);
      const runSimulation = async () =>
        routingService.simulate({
          maxFetch,
          useGoogleOptimization: false,
          originLat: selectedPlan.originLat,
          originLng: selectedPlan.originLng,
          overrideRules: payload,
        });

      let result: RoutingSimulationResult | null = null;
      let lastError: unknown = null;
      const attempts = 2;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          result = await runSimulation();
          break;
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await wait(350);
          }
        }
      }

      if (!result) {
        throw lastError instanceof Error ? lastError : new Error("No se pudo estimar la cobertura.");
      }

      setCoverageEstimate(result);
      setOkMessage("Estimacion de cobertura lista. Puedes ajustar el maximo o continuar con la carga completa.");
      logAudit({
        action: "estimar_cobertura",
        outcome: "ok",
        detail: `Candidatos: ${result.summary.totalCandidateAfterRules} · No asignados: ${result.summary.totalUnassigned}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo estimar la cobertura.");
      logAudit({
        action: "estimar_cobertura",
        outcome: "error",
        detail: err instanceof Error ? err.message : "Error desconocido al estimar cobertura.",
      });
    } finally {
      setSubmitting(false);
    }
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
      const runSimulation = async () =>
        routingService.simulate({
          maxFetch,
          useGoogleOptimization: false,
          originLat: selectedPlan.originLat,
          originLng: selectedPlan.originLng,
          overrideRules: payload,
        });

      let result: RoutingSimulationResult | null = null;
      let lastError: unknown = null;
      const attempts = 2;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          result = await runSimulation();
          break;
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await wait(350);
          }
        }
      }

      if (!result) {
        throw lastError instanceof Error ? lastError : new Error("No se pudieron cargar los reclamos.");
      }

      setLoadedClaims(result);
      setCoverageEstimate(result);
      setGeneratedPlan(null);
      setOperationStage("borrador");
      setSelectedCrewId("");
      goToStep(3);
      setOkMessage("Reclamos cargados. Ya puedes generar la ruta optimizada.");
      logAudit({
        action: "cargar_reclamos",
        outcome: "ok",
        detail: `Leidos: ${result.summary.totalFetched} · Asignables: ${result.summary.totalAssigned}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los reclamos.");
      logAudit({
        action: "cargar_reclamos",
        outcome: "error",
        detail: err instanceof Error ? err.message : "Error desconocido al cargar reclamos.",
      });
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
      if (persistGlobalRules) {
        await routingService.upsertRules(payload);
      }

      const runGenerate = async (withGoogle: boolean) =>
        routingService.generate({
          maxFetch,
          useGoogleOptimization: withGoogle,
          originLat: selectedPlan.originLat,
          originLng: selectedPlan.originLng,
          overrideRules: payload,
        });

      let result: RoutingSimulationResult | null = null;
      let fallbackUsed = false;
      let lastError: unknown = null;

      const attempts = 2;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          result = await runGenerate(useGoogleOptimization);
          break;
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            await wait(400);
          }
        }
      }

      if (!result && useGoogleOptimization) {
        fallbackUsed = true;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          try {
            result = await runGenerate(false);
            break;
          } catch (err) {
            lastError = err;
            if (attempt < attempts) {
              await wait(400);
            }
          }
        }
      }

      if (!result) {
        throw lastError instanceof Error ? lastError : new Error("No se pudo generar la ruta.");
      }

      setGeneratedPlan(result);
      setOperationStage("borrador");
      setSelectedCrewId(result.routes[0]?.crewId ?? "");
      goToStep(4);
      await loadData();

      const totalDistanceKm = result.routes.reduce((acc, route) => acc + route.totalDistanceKm, 0);
      const totalDurationMin = result.routes.reduce((acc, route) => acc + route.totalDurationMin, 0);
      const assignmentRate =
        result.summary.totalFetched > 0
          ? Number(((result.summary.totalAssigned / result.summary.totalFetched) * 100).toFixed(1))
          : 0;

      const snapshot: RunQualitySnapshot = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        planId: result.savedPlanId,
        withGoogle: useGoogleOptimization,
        fallbackUsed,
        totalFetched: result.summary.totalFetched,
        totalAssigned: result.summary.totalAssigned,
        totalUnassigned: result.summary.totalUnassigned,
        assignmentRate,
        totalDistanceKm,
        totalDurationMin,
      };

      setRunHistory((current) => [snapshot, ...current].slice(0, 20));

      setOkMessage(
        fallbackUsed
          ? "Ruta generada con fallback sin Google por un problema transitorio en optimizacion."
          : "Ruta optimizada generada. Revisa el resultado y confirma si esta correcta.",
      );
      logAudit({
        action: "generar_ruta",
        outcome: fallbackUsed ? "info" : "ok",
        detail: fallbackUsed
          ? `Fallback sin Google aplicado. Rutas: ${result.routes.length} · Plan: ${result.savedPlanId ?? "sin persistir"}`
          : `Rutas: ${result.routes.length} · Plan: ${result.savedPlanId ?? "sin persistir"}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la ruta.");
      logAudit({
        action: "generar_ruta",
        outcome: "error",
        detail: err instanceof Error ? err.message : "Error desconocido al generar ruta.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmGeneratedPlan = async () => {
    if (!generatedPlan?.savedPlanId) {
      setError("No hay un plan generado para confirmar.");
      return;
    }

    if (operationStage === "borrador") {
      setError("Valida la corrida antes de confirmar el plan.");
      logAudit({
        action: "confirmar_plan",
        outcome: "error",
        detail: "Se intento confirmar un plan en estado borrador.",
      });
      return;
    }

    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      const result = await routingService.confirmPlan(generatedPlan.savedPlanId);
      await loadData();
      setOperationStage("confirmado");
      setOkMessage(result.message || "Plan confirmado.");
      logAudit({
        action: "confirmar_plan",
        outcome: "ok",
        detail: `Plan confirmado: ${generatedPlan.savedPlanId}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el plan generado.");
      logAudit({
        action: "confirmar_plan",
        outcome: "error",
        detail: err instanceof Error ? err.message : "Error desconocido al confirmar plan.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetOperationStage = (nextStage: OperationStage) => {
    const currentStage = operationStage;

    const rank: Record<OperationStage, number> = {
      borrador: 1,
      validado: 2,
      confirmado: 3,
      despachado: 4,
      cerrado: 5,
    };

    if (rank[nextStage] < rank[currentStage]) {
      setError("No se puede retroceder el estado operativo de la corrida.");
      return;
    }

    setError(null);
    setOperationStage(nextStage);
    setOkMessage(`Estado operativo actualizado a ${OPERATION_STAGE_LABELS[nextStage]}.`);
    logAudit({
      action: "estado_operativo",
      outcome: "info",
      detail: `Cambio de estado: ${OPERATION_STAGE_LABELS[currentStage]} -> ${OPERATION_STAGE_LABELS[nextStage]}`,
    });
  };

  const stepDirectionClass = stepDirection === "forward" ? styles.stepForward : styles.stepBackward;
  const progressPercent = Math.round((wizardStep / 4) * 100);

  const handleStepNavigation = (targetStep: 1 | 2 | 3 | 4) => {
    if (targetStep > maxUnlockedStep) {
      pushToast("info", `Completa el paso ${maxUnlockedStep} antes de avanzar al paso ${targetStep}.`);
      return;
    }

    goToStep(targetStep);
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
          <button
            className={styles.guideItem}
            data-active={wizardStep === 1}
            data-complete={wizardStep > 1}
            data-disabled={false}
            type="button"
            onClick={() => handleStepNavigation(1)}
          >
            <strong>1. Elegir plan</strong>
            <p>Filtra por area y selecciona el plan base.</p>
          </button>
          <button
            className={styles.guideItem}
            data-active={wizardStep === 2}
            data-complete={wizardStep > 2}
            data-disabled={maxUnlockedStep < 2}
            type="button"
            onClick={() => handleStepNavigation(2)}
            disabled={maxUnlockedStep < 2}
          >
            <strong>2. Cargar reclamos</strong>
            <p>Trae los reclamos candidatos para esa corrida.</p>
          </button>
          <button
            className={styles.guideItem}
            data-active={wizardStep === 3}
            data-complete={wizardStep > 3}
            data-disabled={maxUnlockedStep < 3}
            type="button"
            onClick={() => handleStepNavigation(3)}
            disabled={maxUnlockedStep < 3}
          >
            <strong>3. Generar ruta</strong>
            <p>Define usuario operativo y optimiza la ruta.</p>
          </button>
          <button
            className={styles.guideItem}
            data-active={wizardStep === 4}
            data-complete={false}
            data-disabled={maxUnlockedStep < 4}
            type="button"
            onClick={() => handleStepNavigation(4)}
            disabled={maxUnlockedStep < 4}
          >
            <strong>4. Revisar y confirmar</strong>
            <p>Verifica el resultado antes de confirmarlo.</p>
          </button>
        </div>

        <div className={styles.stepperSegments} aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <button
              key={`segment-${step}`}
              className={styles.stepperSegment}
              type="button"
              data-active={wizardStep >= step}
              data-current={wizardStep === step}
              data-disabled={maxUnlockedStep < step}
              onClick={() => handleStepNavigation(step as 1 | 2 | 3 | 4)}
              disabled={maxUnlockedStep < step}
            />
          ))}
        </div>

        <div className={styles.progressWrap} aria-live="polite" aria-atomic="true">
          <div className={styles.progressMeta}>
            <span>Progreso del flujo</span>
            <strong>Paso {wizardStep} de 4</strong>
          </div>
          <div className={styles.progressTrack} role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={wizardStep} aria-label="Progreso de generacion de rutas">
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className={styles.toastViewport} aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={styles.toast} data-kind={toast.kind}>
              {toast.text}
            </div>
          ))}
        </div>

        {wizardStep === 1 && (
        <div className={`${styles.formSection} ${styles.stepPanel} ${stepDirectionClass}`}>
          <h3 className={styles.sectionTitle}>Paso 1. Elegir area y plan</h3>
          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="route-area-filter">
              <span>Area</span>
              <select
                id="route-area-filter"
                className={styles.select}
                value={selectedArea}
                onChange={(event) => setSelectedArea(event.target.value as AreaFilter)}
              >
                <option value="all">Todas</option>
                {availableAreas.map((area) => (
                  <option key={area} value={area}>
                    {getCategoryLabel(area)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field} htmlFor="route-plan-selector">
              <span>Plan</span>
              <select
                id="route-plan-selector"
                className={styles.select}
                value={selectedPlanId}
                onChange={(event) => {
                  const nextPlanId = event.target.value;
                  setSelectedPlanId(nextPlanId);
                  const nextPlan = plans.find((plan) => plan.id === nextPlanId);
                  setSelectedUserId(nextPlan?.userId ?? "");
                }}
              >
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
                <strong>{selectedPlan.categorias.map((categoria) => getCategoryLabel(categoria)).join(", ")}</strong>
              </div>
              <div className={styles.metric}>
                <span>Usuario base</span>
                <strong>{selectedPlan.userName || selectedPlan.userId}</strong>
              </div>
              <div className={styles.metric}>
                <span>Origen</span>
                <strong>{selectedPlan.originAddress || `${selectedPlan.originLat.toFixed(4)}, ${selectedPlan.originLng.toFixed(4)}`}</strong>
              </div>
              <div className={styles.metric}>
                <span>Limites</span>
                <strong>{selectedPlan.dailyByUser} / {selectedPlan.dailyByCategory}</strong>
              </div>
            </div>
          )}

          {selectedPlan && (
            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Validacion previa</h4>
              <div className={styles.grid}>
                {preflightChecks.map((check) => (
                  <div key={check.key} className={styles.metric}>
                    <span>
                      {check.status === "ok"
                        ? "Listo"
                        : check.status === "warning"
                          ? "Atencion"
                          : "Pendiente"}
                    </span>
                    <strong>{check.label}</strong>
                    <span className={styles.subtle}>{check.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actionsRow}>
            <button
              className={styles.buttonPrimary}
              type="button"
              onClick={handleContinueToLoad}
              disabled={!selectedPlan || submitting || loading || hasPreflightBlockingErrors}
            >
              Continuar al paso 2
            </button>
          </div>
        </div>
        )}

        {wizardStep === 2 && selectedPlan && (
          <div className={`${styles.formSection} ${styles.stepPanel} ${stepDirectionClass}`}>
            <h3 className={styles.sectionTitle}>Paso 2. Cargar reclamos</h3>
            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor="route-max-fetch">
                <span>Maximo de reclamos a evaluar</span>
                <input id="route-max-fetch" type="number" min={50} max={5000} value={maxFetch} onChange={(event) => setMaxFetch(Number(event.target.value || 200))} />
              </label>
            </div>

            <div className={styles.actionsRow}>
              <button className={styles.buttonSecondary} type="button" onClick={() => goToStep(1)} disabled={submitting}>
                Volver al paso 1
              </button>
              <button className={styles.buttonSecondary} type="button" onClick={handleEstimateCoverage} disabled={submitting}>
                Estimar cobertura
              </button>
              <button className={styles.buttonPrimary} type="button" onClick={handleLoadClaims} disabled={submitting}>
                Cargar reclamos
              </button>
            </div>

            {coverageEstimate && (
              <div className={styles.formSection}>
                <h4 className={styles.sectionTitle}>Estimacion previa</h4>
                <div className={styles.grid}>
                  <div className={styles.metric}><span>Reclamos leidos</span><strong>{coverageEstimate.summary.totalFetched}</strong></div>
                  <div className={styles.metric}><span>Candidatos</span><strong>{coverageEstimate.summary.totalCandidateAfterRules}</strong></div>
                  <div className={styles.metric}><span>Asignables estimados</span><strong>{coverageEstimate.summary.totalAssigned}</strong></div>
                  <div className={styles.metric}><span>No asignados estimados</span><strong>{coverageEstimate.summary.totalUnassigned}</strong></div>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th>Consumo estimado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(coverageEstimate.summary.categoryQuotaConsumption).length === 0 ? (
                        <tr>
                          <td colSpan={2}>Sin consumo por categoria para mostrar.</td>
                        </tr>
                      ) : (
                        Object.entries(coverageEstimate.summary.categoryQuotaConsumption).map(([categoria, consumo]) => (
                          <tr key={categoria}>
                            <td>{getCategoryLabel(categoria)}</td>
                            <td>{consumo}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {loadedClaims && (
              <>
                <div className={styles.grid}>
                  <div className={styles.metric}><span>Reclamos leidos</span><strong>{loadedClaims.summary.totalFetched}</strong></div>
                  <div className={styles.metric}><span>Candidatos</span><strong>{loadedClaims.summary.totalCandidateAfterRules}</strong></div>
                  <div className={styles.metric}><span>Asignables</span><strong>{loadedClaims.summary.totalAssigned}</strong></div>
                  <div className={styles.metric}><span>No asignados</span><strong>{loadedClaims.summary.totalUnassigned}</strong></div>
                </div>

                {loadedUnassignedByReason.length > 0 && (
                  <div className={styles.formSection}>
                    <h4 className={styles.sectionTitle}>No asignados por causa (Paso 2)</h4>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Causa</th>
                            <th>Cantidad</th>
                            <th>Accion sugerida</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadedUnassignedByReason.map(([reason, count]) => (
                            <tr key={`loaded-${reason}`}>
                              <td>{reason}</td>
                              <td>{count}</td>
                              <td>{getUnassignedSuggestion(reason)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {wizardStep === 3 && selectedPlan && loadedClaims && (
          <div className={`${styles.formSection} ${styles.stepPanel} ${stepDirectionClass}`}>
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

              <label className={styles.checkbox} htmlFor="route-persist-global-rules">
                <input
                  id="route-persist-global-rules"
                  type="checkbox"
                  checked={persistGlobalRules}
                  onChange={(event) => setPersistGlobalRules(event.target.checked)}
                />
                Sobrescribir reglas globales con esta corrida
              </label>
            </div>

            {!persistGlobalRules && (
              <p className={styles.subtle}>
                Esta corrida usara reglas locales del plan (overrideRules) y no modificara la configuracion global.
              </p>
            )}

            <div className={styles.actionsRow}>
              <button className={styles.buttonSecondary} type="button" onClick={() => goToStep(2)} disabled={submitting}>
                Volver al paso 2
              </button>
              <button className={styles.buttonPrimary} type="button" onClick={handleGenerateRoute} disabled={submitting || !selectedUserId}>
                Generar ruta optimizada
              </button>
            </div>
          </div>
        )}

        {wizardStep === 4 && generatedPlan && (
          <div className={`${styles.formSection} ${styles.stepPanel} ${stepDirectionClass}`}>
            <h3 className={styles.sectionTitle}>Paso 4. Revisar y confirmar</h3>

            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Estado operativo</h4>
              <div className={styles.grid}>
                <div className={styles.metric}>
                  <span>Estado actual</span>
                  <strong>{OPERATION_STAGE_LABELS[operationStage]}</strong>
                </div>
              </div>
              <div className={styles.actionsRow}>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => handleSetOperationStage("validado")}
                  disabled={submitting || operationStage !== "borrador"}
                >
                  Marcar validado
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => handleSetOperationStage("despachado")}
                  disabled={submitting || operationStage !== "confirmado"}
                >
                  Marcar despachado
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => handleSetOperationStage("cerrado")}
                  disabled={submitting || operationStage !== "despachado"}
                >
                  Cerrar corrida
                </button>
              </div>
            </div>

            <div className={styles.grid}>
              <div className={styles.metric}><span>Reclamos leidos</span><strong>{generatedPlan.summary.totalFetched}</strong></div>
              <div className={styles.metric}><span>Asignados</span><strong>{generatedPlan.summary.totalAssigned}</strong></div>
              <div className={styles.metric}><span>No asignados</span><strong>{generatedPlan.summary.totalUnassigned}</strong></div>
              <div className={styles.metric}><span>Rutas generadas</span><strong>{generatedPlan.routes.length}</strong></div>
            </div>

            {generatedUnassignedByReason.length > 0 && (
              <div className={styles.formSection}>
                <h4 className={styles.sectionTitle}>No asignados por causa</h4>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Causa</th>
                        <th>Cantidad</th>
                        <th>Accion sugerida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generatedUnassignedByReason.map(([reason, count]) => (
                        <tr key={`generated-${reason}`}>
                          <td>{reason}</td>
                          <td>{count}</td>
                          <td>{getUnassignedSuggestion(reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                        <td>{getCategoryLabel(stop.categoria)}</td>
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
              <button className={styles.buttonSecondary} type="button" onClick={() => goToStep(3)} disabled={submitting}>
                Volver al paso 3
              </button>
              <button className={styles.buttonPrimary} type="button" onClick={handleConfirmGeneratedPlan} disabled={submitting || !generatedPlan.savedPlanId}>
                Confirmar plan generado
              </button>
            </div>

            {runHistory.length > 0 && (
              <div className={styles.formSection}>
                <h4 className={styles.sectionTitle}>Calidad de corridas (historial)</h4>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Asignacion</th>
                        <th>Asignados / Leidos</th>
                        <th>No asignados</th>
                        <th>Distancia total (km)</th>
                        <th>Duracion total (min)</th>
                        <th>Motor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runHistory.map((run) => (
                        <tr key={run.id}>
                          <td>{new Date(run.at).toLocaleString()}</td>
                          <td>{run.assignmentRate}%</td>
                          <td>{run.totalAssigned} / {run.totalFetched}</td>
                          <td>{run.totalUnassigned}</td>
                          <td>{run.totalDistanceKm.toFixed(2)}</td>
                          <td>{run.totalDurationMin.toFixed(1)}</td>
                          <td>
                            {run.withGoogle
                              ? run.fallbackUsed
                                ? "Google -> Fallback"
                                : "Google"
                              : "Interno"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {auditTrail.length > 0 && (
              <div className={styles.formSection}>
                <h4 className={styles.sectionTitle}>Bitacora de la corrida</h4>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Accion</th>
                        <th>Resultado</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditTrail.map((entry) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.at).toLocaleString()}</td>
                          <td>{entry.action}</td>
                          <td>{entry.outcome}</td>
                          <td>{entry.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    </section>
  );
}

function normalizeCategory(value: string): RoutingCategoryRule["categoria"] | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return CATEGORY_ALIASES[normalized] ?? null;
}

function getPlanCategories(plan: RoutingAreaPlan): RoutingCategoryRule["categoria"][] {
  const categories = plan.categorias
    .map((categoria) => normalizeCategory(categoria))
    .filter((categoria): categoria is RoutingCategoryRule["categoria"] => Boolean(categoria));

  return Array.from(new Set(categories));
}