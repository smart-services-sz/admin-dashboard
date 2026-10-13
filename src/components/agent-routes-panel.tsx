"use client";

import { useEffect, useState } from "react";
import { routingService, type AssignedRoute, type InterventionResult } from "@/services/routing.service";
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<InterventionResult>("resuelto");
  const [observation, setObservation] = useState("");

  async function loadRoute() {
    setLoading(true);
    setError("");
    try {
      const response = await routingService.getAssignedRoutes();
      setRoutes(response.data);
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
    if (!route || !nextStop || route.status !== "in_progress" || busy) return;
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
      setObservation("");
      setResult("resuelto");
      setSelectedRouteId(route.id);
      setNotice(finished + 1 === stops.length ? "Ruta completada. Todos los trabajos fueron registrados." : "Trabajo registrado.");
      await loadRoute();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el trabajo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Mis rutas asignadas">
      <div className={styles.panelHeader}>
        <h2>Mis rutas</h2>
        <button className={styles.secondaryAction} type="button" disabled={loading || busy} onClick={() => void loadRoute()}>Actualizar</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status">Cargando rutas...</p> : !route && !error ? (
        <p>No tienes rutas asignadas.</p>
      ) : route ? (
        <>
          <label className={styles.field} htmlFor="agent-route">Ruta asignada
            <select id="agent-route" value={route.id} disabled={busy} onChange={(event) => {
              setSelectedRouteId(event.target.value);
              setObservation("");
              setResult("resuelto");
              setNotice("");
              setError("");
            }}>
              {routes.map((item) => <option key={item.id} value={item.id}>{item.plan.planningDate.slice(0, 10)} · {item.nombre} · {routeLabels[item.status]}</option>)}
            </select>
          </label>
          <div className={styles.panelHeader}>
            <div>
              <h3>{route.nombre}</h3>
              <p>{route.plan.planningDate.slice(0, 10)} · {routeLabels[route.status]}</p>
              <p>{finished} de {stops.length} trabajos registrados · {route.totalDistanceKm.toFixed(1)} km</p>
            </div>
            {route.status === "assigned" && <button className={styles.primaryAction} disabled={busy || !nextStop} onClick={() => void startRoute()} type="button">Comenzar ruta</button>}
          </div>
          <ol className={styles.agentStops}>
            {stops.map((stop) => (
              <li key={stop.id} className={styles.agentStop} data-current={stop.id === nextStop?.id}>
                <h3>Parada {stop.sequence}: {stop.direccion}</h3>
                <p>{stop.categoria} · {stop.prioridad} · Reclamo {stop.reclamoId}</p>
                <p>{stop.intervention ? resultLabels[stop.intervention.result] : stop.id === nextStop?.id ? "Siguiente trabajo" : "Pendiente"}</p>
                {stop.intervention?.observation && <p>{stop.intervention.observation}</p>}
                <a href={`https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`} target="_blank" rel="noopener noreferrer">Ver ubicacion</a>
                {stop.id === nextStop?.id && route.status === "in_progress" && (
                  <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void finishStop(); }}>
                    <label htmlFor="intervention-result">Resultado
                      <select id="intervention-result" value={result} disabled={busy} onChange={(event) => setResult(event.target.value as InterventionResult)}>
                        {Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label htmlFor="intervention-observation">Observaciones
                      <textarea id="intervention-observation" maxLength={2000} value={observation} disabled={busy} onChange={(event) => setObservation(event.target.value)} />
                    </label>
                    <button className={styles.primaryAction} disabled={busy} type="submit">{busy ? "Guardando..." : "Cerrar trabajo"}</button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}