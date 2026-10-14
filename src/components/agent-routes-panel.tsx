"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Clock3, MapPin, Navigation, Play, RefreshCw, Route } from "lucide-react";
import { routingService, type AssignedRoute, type InterventionResult } from "@/services/routing.service";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/services/reclamos.service";
import styles from "./admin-dashboard.module.css";

const resultLabels: Record<InterventionResult, string> = {
  resuelto: "Resuelto",
  no_resuelto: "No resuelto",
  requiere_nueva_visita: "Requiere nueva visita",
  no_corresponde: "No corresponde",
};

const routeLabels: Record<AssignedRoute["status"], string> = {
  assigned: "Por comenzar",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
};

export function AgentRoutesPanel() {
  const [routes, setRoutes] = useState<AssignedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<InterventionResult>("resuelto");
  const [observation, setObservation] = useState("");
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);

  async function loadRoute() {
    setLoading(true);
    setError("");
    try {
      const response = await routingService.getAssignedRoutes();
      setRoutes(response.data);
      setRequiresRefresh(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las rutas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void routingService.getAssignedRoutes()
      .then((response) => {
        if (!cancelled) setRoutes(response.data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las rutas.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const route = routes.find((item) => item.id === selectedRouteId)
    ?? routes.find((item) => item.status === "in_progress")
    ?? routes.find((item) => item.status === "assigned")
    ?? routes[0];
  const stops = route ? [...route.stops].sort((first, second) => first.sequence - second.sequence) : [];
  const nextStop = stops.find((stop) => stop.status === "pendiente");
  const finished = stops.filter((stop) => stop.status !== "pendiente").length;
  const planningDate = route ? new Intl.DateTimeFormat("es-AR", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(route.plan.planningDate)) : "";

  async function startRoute() {
    if (!route || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await routingService.startRoute(route.id);
      await loadRoute();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo comenzar la ruta.");
    } finally {
      setBusy(false);
    }
  }

  async function finishStop() {
    if (!route || !nextStop || route.status !== "in_progress" || busy || requiresRefresh) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await routingService.registerIntervention({
        routeId: route.id,
        stopId: nextStop.id,
        result,
        observation: observation.trim() || undefined,
      });
      setRequiresRefresh(true);
      setObservation("");
      setResult("resuelto");
      setSelectedRouteId(route.id);
      setNotice(finished + 1 === stops.length ? "Ruta completada. Todos los trabajos fueron registrados." : "Trabajo registrado.");
      await loadRoute();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo registrar el trabajo.";
      setRequiresRefresh(true);
      try {
        const response = await routingService.getAssignedRoutes();
        setRoutes(response.data);
        setSelectedRouteId(route.id);
        setRequiresRefresh(false);
        const refreshedRoute = response.data.find((item) => item.id === route.id);
        const refreshedStop = refreshedRoute?.stops.find((stop) => stop.id === nextStop.id);
        if (refreshedStop && refreshedStop.status !== "pendiente" && refreshedStop.intervention) {
          setObservation("");
          setResult("resuelto");
          setNotice(refreshedRoute?.status === "completed"
            ? "Ruta completada. El ultimo trabajo ya figura registrado; se recupero el estado tras un error de respuesta."
            : "El trabajo ya figura registrado. Se actualizo la ruta tras un error de respuesta.");
          if (message.includes("fallo la sincronizacion del reclamo")) {
            setError("El trabajo esta guardado en la ruta, pero la sincronizacion del reclamo sigue pendiente.");
          }
        } else {
          setError(message);
        }
      } catch {
        setError(`${message} No se pudo confirmar si el trabajo fue registrado. Actualiza la ruta antes de volver a intentar.`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function attachEvidence(
    stopId: string,
    interventionId: string,
    file: File,
  ) {
    if (file.size > 5 * 1024 * 1024) {
      setError("La evidencia debe pesar como maximo 5 MB.");
      return;
    }
    setEvidenceBusyId(stopId);
    setError("");
    setNotice("");
    try {
      await routingService.attachInterventionEvidence({ interventionId, file });
      setNotice("Evidencia adjuntada correctamente.");
      await loadRoute();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo adjuntar la evidencia.",
      );
    } finally {
      setEvidenceBusyId(null);
    }
  }

  return (
    <section className={styles.agentPanel} aria-label="Mis rutas asignadas" aria-busy={loading || busy}>
      <div className={styles.agentHeader}>
        <div className={styles.agentHeading}>
          <Route size={24} aria-hidden="true" />
          <h2>Mis rutas</h2>
        </div>
        <button className={styles.agentIconButton} type="button" aria-label="Actualizar rutas" title="Actualizar rutas" disabled={loading || busy} onClick={() => void loadRoute()}>
          <RefreshCw size={20} aria-hidden="true" className={loading ? styles.agentSpinner : undefined} />
        </button>
      </div>
      {error && <div className={styles.agentFeedback} data-tone="error" role="alert"><AlertCircle size={20} aria-hidden="true" /><p>{error}</p></div>}
      {notice && <div className={styles.agentFeedback} data-tone="success" role="status"><CheckCircle2 size={20} aria-hidden="true" /><p>{notice}</p></div>}
      {loading && routes.length === 0 ? (
        <div className={styles.agentEmpty} role="status"><RefreshCw size={28} className={styles.agentSpinner} aria-hidden="true" /><p>Cargando rutas...</p></div>
      ) : !route && !error ? (
        <div className={styles.agentEmpty}><Route size={36} aria-hidden="true" /><h3>No tienes rutas asignadas.</h3></div>
      ) : route ? (
        <>
          <div className={styles.agentRoutePicker}>
            <label htmlFor="agent-route">Ruta asignada</label>
            <select id="agent-route" value={route.id} disabled={busy || loading} onChange={(event) => {
              setSelectedRouteId(event.target.value);
              setObservation("");
              setResult("resuelto");
              setNotice("");
              setError("");
            }}>
              {routes.map((item) => <option key={item.id} value={item.id}>{item.plan.planningDate.slice(0, 10)} · {item.nombre} · {routeLabels[item.status]}</option>)}
            </select>
          </div>
          <section className={styles.agentSummary} aria-label="Resumen de ruta">
            <div className={styles.agentSummaryTop}>
              <div>
                <p className={styles.agentEyebrow}>{planningDate}</p>
                <h3>{route.nombre}</h3>
              </div>
              <span className={styles.agentStatus} data-status={route.status}>
                {route.status === "completed" ? <CheckCircle2 size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}
                {routeLabels[route.status]}
              </span>
            </div>
            <div className={styles.agentProgressHeader}>
              <p>{finished} de {stops.length} trabajos registrados · {route.totalDistanceKm.toFixed(1)} km</p>
              <strong>{stops.length ? Math.round(finished / stops.length * 100) : 0}%</strong>
            </div>
            <progress className={styles.agentProgress} value={finished} max={stops.length || 1} aria-label="Avance de la ruta" />
          </section>
          <div className={styles.agentWorkspace}>
            <section className={styles.agentWork} aria-labelledby="agent-work-heading">
              {nextStop && (route.status === "assigned" || route.status === "in_progress") ? (
                <>
                  <div className={styles.agentWorkHeader}>
                    <span className={styles.agentEyebrow}>{route.status === "assigned" ? "Primer trabajo" : "Trabajo actual"}</span>
                    <span className={styles.agentStepCount}>Parada {nextStop.sequence} de {stops.length}</span>
                  </div>
                  <h3 id="agent-work-heading">{nextStop.direccion}</h3>
                  <div className={styles.agentWorkMeta}>
                    <span>{CATEGORIA_LABELS[nextStop.categoria] ?? nextStop.categoria}</span>
                    <span className={styles.agentPriority} data-priority={nextStop.prioridad}>Prioridad {PRIORIDAD_LABELS[nextStop.prioridad] ?? nextStop.prioridad}</span>
                  </div>
                  <a className={styles.agentMapLink} href={`https://www.google.com/maps/dir/?api=1&destination=${nextStop.lat},${nextStop.lng}`} target="_blank" rel="noopener noreferrer">
                    <Navigation size={18} aria-hidden="true" /> Ver ubicacion<span className={styles.agentSrOnly}> (abre en otra pestana)</span>
                  </a>
                  <p className={styles.agentReference}>Reclamo {nextStop.reclamoId}</p>
                  {route.status === "assigned" ? (
                    <button className={styles.agentPrimaryButton} disabled={busy || loading || requiresRefresh} onClick={() => void startRoute()} type="button">
                      <Play size={18} aria-hidden="true" />{busy ? "Comenzando..." : "Comenzar ruta"}
                    </button>
                  ) : (
                    <form className={styles.agentForm} onSubmit={(event) => { event.preventDefault(); void finishStop(); }}>
                      <div className={styles.agentFormField}>
                        <label htmlFor="intervention-result">Resultado del trabajo</label>
                        <select id="intervention-result" value={result} disabled={busy || loading} onChange={(event) => setResult(event.target.value as InterventionResult)}>
                          {Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div className={styles.agentFormField}>
                        <div className={styles.agentFieldLabel}><label htmlFor="intervention-observation">Observaciones</label><span>Opcional</span></div>
                        <textarea id="intervention-observation" rows={4} maxLength={2000} value={observation} disabled={busy || loading} onChange={(event) => setObservation(event.target.value)} aria-describedby="observation-count" />
                        <span id="observation-count" className={styles.agentCharacterCount}>{observation.length}/2000</span>
                      </div>
                      <button className={styles.agentPrimaryButton} disabled={busy || loading || requiresRefresh} type="submit">
                        <Check size={18} aria-hidden="true" />{busy ? "Guardando..." : "Cerrar trabajo"}
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <div className={styles.agentWorkFinished}>
                  <CheckCircle2 size={40} aria-hidden="true" />
                  <h3 id="agent-work-heading">{route.status === "completed" ? "Ruta completada" : "Sin trabajos pendientes"}</h3>
                  <p>{finished} trabajos registrados</p>
                </div>
              )}
            </section>
            <section className={styles.agentItinerary} aria-labelledby="agent-itinerary-heading">
              <div className={styles.agentItineraryHeader}><h3 id="agent-itinerary-heading">Recorrido</h3><span>{stops.length} paradas</span></div>
              <ol className={styles.agentStops}>
                {stops.map((stop) => (
                  <li key={stop.id} className={styles.agentStop} data-current={stop.id === nextStop?.id} data-finished={stop.status !== "pendiente"} aria-current={stop.id === nextStop?.id ? "step" : undefined}>
                    <span className={styles.agentStopNumber} aria-hidden="true">{stop.status !== "pendiente" ? <Check size={16} /> : stop.sequence}</span>
                    <div className={styles.agentStopContent}>
                      <h4>{stop.direccion}</h4>
                      <p>{CATEGORIA_LABELS[stop.categoria] ?? stop.categoria}</p>
                      <span className={styles.agentStopState}>{stop.intervention ? resultLabels[stop.intervention.result] : stop.id === nextStop?.id ? "Siguiente trabajo" : "Pendiente"}</span>
                      {stop.intervention?.observation && <p className={styles.agentStopObservation}>{stop.intervention.observation}</p>}
                      {stop.intervention && (
                        <div className={styles.agentEvidence}>
                          {stop.intervention.evidences?.map((evidence) => (
                            <a
                              key={evidence.id}
                              href={evidence.urlArchivo}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {evidence.nombreArchivo}
                            </a>
                          ))}
                          {stop.intervention.id && (
                            <label>
                              {evidenceBusyId === stop.id
                                ? "Subiendo evidencia..."
                                : "Adjuntar evidencia"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                                disabled={busy || loading || evidenceBusyId !== null}
                                onChange={(event) => {
                                  const file = event.currentTarget.files?.[0];
                                  event.currentTarget.value = "";
                                  if (file) {
                                    void attachEvidence(
                                      stop.id,
                                      stop.intervention!.id!,
                                      file,
                                    );
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                    <a className={styles.agentStopMap} href={`https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`} target="_blank" rel="noopener noreferrer" aria-label={`Ver ubicacion de parada ${stop.sequence} (abre en otra pestana)`} title={`Ver ubicacion de parada ${stop.sequence}`}><MapPin size={18} aria-hidden="true" /></a>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}