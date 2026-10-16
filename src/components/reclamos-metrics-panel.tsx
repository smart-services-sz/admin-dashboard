"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { AuthUser } from "@/lib/auth.server";
import { municipalConfigService, type MunicipalityConfiguration } from "@/services/municipal-config.service";
import { metricsService, type MetricsChannel, type MetricsPriority, type MetricsStatus, type ReclamoMetrics, type ReclamoMetricsFilters, type RoutingMetrics } from "@/services/metrics.service";
import styles from "./admin-dashboard.module.css";

type Filters = Omit<ReclamoMetricsFilters, "municipalityId">;

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultFilters(): Filters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: dateValue(from), to: dateValue(to), bucketDays: 1 };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR").format(value);
}

function formatDecimal(value: number, digits = 1) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(value);
}

function formatHours(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Sin datos";
  if (value < 24) return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)} h`;
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value / 24)} días`;
}

function channelName(value: string) {
  const names: Record<string, string> = {
    whatsapp: "WhatsApp", web: "Web", email: "Email", instagram: "Instagram",
    facebook: "Facebook", manual: "Manual", other: "Otro",
  };
  return names[value] ?? value;
}

function statusName(value: string) {
  const names: Record<string, string> = {
    pendiente: "Pendiente", en_proceso: "En proceso", resuelto: "Resuelto",
    rechazado: "Rechazado", cerrado: "Cerrado",
  };
  return names[value] ?? value;
}

function priorityName(value: string) {
  const names: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };
  return names[value] ?? value;
}

function Breakdown({ title, items, label }: { title: string; items: Array<{ name: string; total: number }>; label: (name: string) => string }) {
  const max = Math.max(1, ...items.map((item) => item.total));
  return (
    <section className={styles.metricsBreakdown} aria-label={title}>
      <h3>{title}</h3>
      {items.length ? <ol>
        {items.slice().sort((a, b) => b.total - a.total).map((item) => (
          <li key={item.name}>
            <div className={styles.metricsBreakdownLabel}><span>{label(item.name)}</span><strong>{formatNumber(item.total)}</strong></div>
            <div className={styles.metricsBar}><span style={{ width: `${Math.max(item.total > 0 ? 2 : 0, (item.total / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ol> : <p className={styles.metricsEmpty}>Sin datos en el período.</p>}
    </section>
  );
}

function Timeline({ metrics, bucketDays }: { metrics: ReclamoMetrics; bucketDays: number }) {
  const max = Math.max(1, ...metrics.timeline.map((item) => item.total));
  return (
    <section className={styles.metricsTimeline} aria-label="Reclamos creados en el tiempo">
      <header><h3>Volumen en el tiempo</h3><span>{bucketDays === 1 ? "Por día" : bucketDays === 7 ? "Por semana" : "Por mes"}</span></header>
      {metrics.timeline.length ? <div className={styles.metricsTimelineRows}>
        {metrics.timeline.map((item) => <div className={styles.metricsTimelineRow} key={item.period}>
          <time dateTime={item.period}>{new Date(item.period).toLocaleDateString("es-AR", { day: "2-digit", month: "short", ...(bucketDays === 30 ? { year: "2-digit" } : {}) })}</time>
          <div className={styles.metricsBar}><span style={{ width: `${Math.max(item.total > 0 ? 2 : 0, (item.total / max) * 100)}%` }} /></div>
          <strong>{formatNumber(item.total)}</strong>
        </div>)}
      </div> : <p className={styles.metricsEmpty}>Sin actividad en el período.</p>}
    </section>
  );
}

function RoutingTimeline({ metrics, bucketDays }: { metrics: RoutingMetrics; bucketDays: number }) {
  const max = Math.max(1, ...metrics.timeline.map((item) => item.plans));
  return (
    <section className={styles.metricsTimeline} aria-label="Planes de ruteo en el tiempo">
      <header><h3>Planes en el tiempo</h3><span>{bucketDays === 1 ? "Por día" : bucketDays === 7 ? "Por semana" : "Por mes"}</span></header>
      {metrics.timeline.length ? <div className={styles.metricsTimelineRows}>
        {metrics.timeline.map((item) => <div className={styles.metricsTimelineRow} key={item.period}>
          <time dateTime={item.period}>{new Date(item.period).toLocaleDateString("es-AR", { day: "2-digit", month: "short", ...(bucketDays === 30 ? { year: "2-digit" } : {}) })}</time>
          <div className={styles.metricsBar}><span style={{ width: `${Math.max(item.plans > 0 ? 2 : 0, (item.plans / max) * 100)}%` }} /></div>
          <strong>{formatNumber(item.plans)}</strong>
        </div>)}
      </div> : <p className={styles.metricsEmpty}>Sin planes en el período.</p>}
    </section>
  );
}

export function ReclamosMetricsPanel({ user }: { user: AuthUser }) {
  const [municipalities, setMunicipalities] = useState<MunicipalityConfiguration[]>([]);
  const [municipalityId, setMunicipalityId] = useState(user.municipalityId ?? "");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [draft, setDraft] = useState<Filters>(defaultFilters);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [metrics, setMetrics] = useState<ReclamoMetrics | null>(null);
  const [routingMetrics, setRoutingMetrics] = useState<RoutingMetrics | null>(null);
  const [routingError, setRoutingError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    municipalConfigService.list(false)
      .then((items) => {
        if (!active) return;
        const enabled = items.filter((item) => item.isActive);
        setMunicipalities(enabled);
        if (user.municipalityId) setMunicipalityId(user.municipalityId);
        else if (!municipalityId && enabled.length === 1) setMunicipalityId(enabled[0].id);
      })
      .catch((cause: unknown) => {
        if (active) setCatalogError(cause instanceof Error ? cause.message : "No se pudo cargar el catálogo municipal.");
      })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [user.municipalityId]);

  useEffect(() => {
    if (!municipalityId || catalogLoading || catalogError) {
      setMetrics(null);
      setRoutingMetrics(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    setRoutingError("");
    setMetrics(null);
    setRoutingMetrics(null);
    Promise.allSettled([
      metricsService.getReclamoMetrics({
        ...filters,
        municipalityId,
        ...(user.areaId ? { areaId: user.areaId } : {}),
      }),
      metricsService.getRoutingMetrics({ municipalityId, from: filters.from, to: filters.to, bucketDays: filters.bucketDays }),
    ]).then(([reclamosResult, routingResult]) => {
      if (!active) return;
      if (reclamosResult.status === "fulfilled") setMetrics(reclamosResult.value);
      else setError(reclamosResult.reason instanceof Error ? reclamosResult.reason.message : "No se pudieron cargar las métricas de reclamos.");
      if (routingResult.status === "fulfilled") setRoutingMetrics(routingResult.value);
      else setRoutingError(routingResult.reason instanceof Error ? routingResult.reason.message : "No se pudieron cargar las métricas de ruteo.");
    })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [municipalityId, catalogLoading, catalogError, filters, refreshKey, user.areaId]);

  const municipality = municipalities.find((item) => item.id === municipalityId);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from > draft.to) {
      setError("La fecha inicial debe ser anterior o igual a la fecha final.");
      return;
    }
    setFilters({ ...draft });
    setRefreshKey((current) => current + 1);
  }

  function resetFilters() {
    const next = defaultFilters();
    setDraft(next);
    setFilters(next);
    setRefreshKey((current) => current + 1);
  }

  if (catalogLoading) return <section className={styles.panel} aria-busy="true"><p role="status">Cargando municipios...</p></section>;
  if (catalogError) return <section className={styles.panel}><p className={styles.metricsError} role="alert">{catalogError}</p></section>;
  if (user.municipalityId && !municipality) return <section className={styles.panel}><p className={styles.metricsError} role="alert">El municipio asignado a tu usuario no está activo o no está disponible.</p></section>;

  const changeLabel = metrics?.summary.changePercent === null || metrics?.summary.changePercent === undefined
    ? "Sin período comparable"
    : `${metrics.summary.changePercent > 0 ? "+" : ""}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(metrics.summary.changePercent)}% vs. período anterior`;
  const cards = metrics ? [
    { label: "Reclamos recibidos", value: formatNumber(metrics.summary.total), note: changeLabel },
    { label: "Pendientes y en proceso", value: formatNumber(metrics.summary.open), note: `${formatNumber(metrics.byStatus.find((item) => item.name === "pendiente")?.total ?? 0)} pendientes` },
    { label: "Resueltos", value: formatNumber(metrics.summary.resolved), note: `${formatNumber(metrics.summary.resolutionRate)}% de los recibidos` },
    { label: "Rechazados", value: formatNumber(metrics.summary.rejected), note: "En el período" },
    { label: "Resolución media", value: formatHours(metrics.summary.averageResolutionHours), note: `Mediana ${formatHours(metrics.summary.medianResolutionHours)}` },
    { label: "Cerrados", value: formatNumber(metrics.summary.closed), note: "En el período" },
  ] : [];

  return (
    <section className={styles.metricsWorkspace} aria-busy={loading}>
      <article className={styles.panel}>
        <header className={styles.panelHeader}>
          <div><h2>Métricas de reclamos</h2><span>{municipality ? `${municipality.name} · ${municipality.id}` : "Selecciona un municipio para consultar sus indicadores"}</span></div>
          <button type="button" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading || !municipalityId}>Actualizar</button>
        </header>
        <form className={styles.metricsFilters} onSubmit={applyFilters}>
          {!user.municipalityId ? <label>Municipio<select required value={municipalityId} onChange={(event) => setMunicipalityId(event.target.value)}>
            <option value="">Selecciona municipio</option>{municipalities.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.id}</option>)}
          </select></label> : <label>Municipio<input value={`${municipality?.name ?? municipalityId} · ${municipalityId}`} readOnly /></label>}
          <label>Desde<input type="date" required value={draft.from} onChange={(event) => update("from", event.target.value)} /></label>
          <label>Hasta<input type="date" required value={draft.to} onChange={(event) => update("to", event.target.value)} /></label>
          <label>Intervalo<select value={draft.bucketDays} onChange={(event) => update("bucketDays", Number(event.target.value) as 1 | 7 | 30)}>
            <option value={1}>Diario</option><option value={7}>Semanal</option><option value={30}>Mensual</option>
          </select></label>
          <label>Área<select value={user.areaId ?? draft.areaId ?? ""} disabled={Boolean(user.areaId)} onChange={(event) => update("areaId", event.target.value)}>
            <option value="">Todas las áreas</option>{(municipality?.areas ?? []).filter((item) => item.isActive).map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select></label>
          <label>Estado<select value={draft.estado ?? ""} onChange={(event) => update("estado", event.target.value as MetricsStatus | "")}>
            <option value="">Todos</option><option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="resuelto">Resuelto</option><option value="rechazado">Rechazado</option><option value="cerrado">Cerrado</option>
          </select></label>
          <label>Categoría<select value={draft.categoria ?? ""} onChange={(event) => update("categoria", event.target.value)}>
            <option value="">Todas</option>{(municipality?.categories ?? []).filter((item) => item.isActive).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select></label>
          <label>Prioridad<select value={draft.prioridad ?? ""} onChange={(event) => update("prioridad", event.target.value as MetricsPriority | "")}>
            <option value="">Todas</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
          </select></label>
          <label>Canal<select value={draft.canal ?? ""} onChange={(event) => update("canal", event.target.value as MetricsChannel | "")}>
            <option value="">Todos</option><option value="whatsapp">WhatsApp</option><option value="web">Web</option><option value="email">Email</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="manual">Manual</option><option value="other">Otro</option>
          </select></label>
          <div className={styles.metricsFilterActions}><button type="submit" disabled={loading || !municipalityId}>Aplicar filtros</button><button type="button" onClick={resetFilters} disabled={loading}>Restablecer</button></div>
        </form>
        {error ? <p className={styles.metricsError} role="alert">{error}</p> : null}
        {loading ? <p className={styles.metricsFeedback} role="status">Calculando indicadores...</p> : null}
      </article>

      {!municipalityId && !user.municipalityId ? <p className={styles.metricsFeedback} role="status">Elegí un municipio para ver sus datos. Nunca se combinan municipios en esta vista.</p> : null}
      {metrics && !loading ? <>
        <div className={styles.metricsGrid}>
          {cards.map((card) => <article className={styles.metricCard} key={card.label}><p>{card.label}</p><strong>{card.value}</strong><span className={styles.metricNote}>{card.note}</span></article>)}
        </div>
        <div className={styles.metricsVisualGrid}>
          <Timeline metrics={metrics} bucketDays={filters.bucketDays} />
          <Breakdown title="Por estado" items={metrics.byStatus} label={statusName} />
          <Breakdown title="Por categoría" items={metrics.byCategory} label={(value) => municipality?.categories.find((item) => item.code === value)?.name ?? value} />
          <Breakdown title="Por prioridad" items={metrics.byPriority} label={priorityName} />
          <Breakdown title="Por canal" items={metrics.byChannel} label={channelName} />
          <Breakdown title="Por área" items={metrics.byArea} label={(value) => municipality?.areas.find((item) => item.slug === value)?.name ?? (value === "sin_area" ? "Sin área" : value)} />
        </div>
      </> : null}
      {municipalityId && !loading ? <section className={styles.panel} aria-label="Métricas de ruteo municipal">
        <header className={styles.panelHeader}>
          <div><h2>Ruteo municipal</h2><span>Totales del municipio y período seleccionado. No se segmenta por área ni por filtros de reclamos.</span></div>
        </header>
        {routingError ? <p className={styles.metricsError} role="alert">{routingError}</p> : null}
        {routingMetrics ? <>
          <div className={styles.metricsGrid}>
            <article className={styles.metricCard}><p>Planes</p><strong>{formatNumber(routingMetrics.summary.totalPlans)}</strong><span className={styles.metricNote}>{formatNumber(routingMetrics.summary.confirmedPlans)} confirmados · {formatNumber(routingMetrics.summary.proposedPlans)} propuestos</span></article>
            <article className={styles.metricCard}><p>Rutas</p><strong>{formatNumber(routingMetrics.summary.totalRoutes)}</strong><span className={styles.metricNote}>{formatNumber(routingMetrics.summary.completedRoutes)} completadas · {formatNumber(routingMetrics.summary.routeCompletionRate)}% de cierre</span></article>
            <article className={styles.metricCard}><p>Reclamos asignados</p><strong>{formatNumber(routingMetrics.summary.assignedClaims)}</strong><span className={styles.metricNote}>{formatNumber(routingMetrics.summary.unassignedClaims)} sin asignar</span></article>
            <article className={styles.metricCard}><p>Paradas completadas</p><strong>{formatNumber(routingMetrics.summary.completedStops)}</strong><span className={styles.metricNote}>{formatNumber(routingMetrics.summary.pendingStops)} pendientes · {formatNumber(routingMetrics.summary.stopCompletionRate)}% completadas</span></article>
            <article className={styles.metricCard}><p>Intervenciones</p><strong>{formatNumber(routingMetrics.summary.interventions)}</strong><span className={styles.metricNote}>{formatNumber(routingMetrics.summary.evidences)} evidencias</span></article>
            <article className={styles.metricCard}><p>Distancia planificada</p><strong>{formatDecimal(routingMetrics.summary.totalDistanceKm)} km</strong><span className={styles.metricNote}>{formatDecimal(routingMetrics.summary.totalDurationMin / 60)} h estimadas</span></article>
          </div>
          <div className={styles.metricsVisualGrid}>
            <RoutingTimeline metrics={routingMetrics} bucketDays={filters.bucketDays} />
            <Breakdown title="Planes por estado" items={routingMetrics.byPlanStatus} label={statusName} />
            <Breakdown title="Rutas por estado" items={routingMetrics.byRouteStatus} label={statusName} />
            <Breakdown title="Paradas por estado" items={routingMetrics.byStopStatus} label={statusName} />
            <Breakdown title="Paradas por categoría" items={routingMetrics.byStopCategory} label={(value) => municipality?.categories.find((item) => item.code === value)?.name ?? value} />
            <Breakdown title="Intervenciones por resultado" items={routingMetrics.byInterventionResult} label={(value) => value} />
            <Breakdown title="Reclamos sin asignar" items={routingMetrics.unassignedByReason} label={(value) => value} />
          </div>
        </> : null}
      </section> : null}
    </section>
  );
}