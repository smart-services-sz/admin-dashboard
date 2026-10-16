"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  auditService,
  type AuditLevel,
  type AuditLogEntry,
  type AuditLogFilters,
} from "@/services/audit.service";
import styles from "./admin-dashboard.module.css";

const pageSize = 25;
const levels: AuditLevel[] = ["INFO", "WARNING", "ERROR", "SECURITY"];
const emptyFilters: AuditLogFilters = {
  service: "",
  performedBy: "",
  action: "",
  level: "",
  entity: "",
  entityId: "",
  municipalityId: "",
  correlationId: "",
  from: "",
  to: "",
};

function display(value?: string | null) {
  return value?.trim() || "-";
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  return (
    <tr>
      <td><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("es-AR")}</time></td>
      <td><span className={styles.auditLevel} data-level={entry.level}>{entry.level}</span></td>
      <td>{entry.service}</td>
      <td><code>{entry.action}</code></td>
      <td>{display(entry.performedBy)}</td>
      <td>{display(entry.municipalityId)}</td>
      <td>
        <span>{entry.entity}</span>
        {entry.entityId ? <small className={styles.auditSubValue}>{entry.entityId}</small> : null}
      </td>
      <td><code className={styles.auditCorrelation}>{display(entry.correlationId)}</code></td>
      <td>
        {(entry.metadata || entry.ipAddress || entry.userAgent) ? (
          <details className={styles.auditDetails}>
            <summary>Ver detalle</summary>
            <dl>
              {entry.ipAddress ? <><dt>IP</dt><dd>{entry.ipAddress}</dd></> : null}
              {entry.userAgent ? <><dt>User-Agent</dt><dd>{entry.userAgent}</dd></> : null}
            </dl>
            {entry.metadata ? <pre>{JSON.stringify(entry.metadata, null, 2)}</pre> : null}
          </details>
        ) : "-"}
      </td>
    </tr>
  );
}

export function AuditLogsPanel() {
  const [draft, setDraft] = useState<AuditLogFilters>(emptyFilters);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [meta, setMeta] = useState({ totalItems: 0, itemsPerPage: pageSize, currentPage: 1, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    auditService.list({ ...filters, page, limit: pageSize })
      .then((result) => {
        if (!active) return;
        setEntries(result.data);
        setMeta(result.meta);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los logs.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filters, page, refreshKey]);

  function update<K extends keyof AuditLogFilters>(key: K, value: AuditLogFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = Object.fromEntries(
      Object.entries(draft).filter(([, value]) => value !== "" && value !== undefined),
    ) as AuditLogFilters;
    setFilters(next);
    setPage(1);
    setRefreshKey((current) => current + 1);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setFilters({});
    setPage(1);
    setRefreshKey((current) => current + 1);
  }

  return (
    <section className={styles.panel} aria-labelledby="audit-logs-title">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="audit-logs-title">Registro de auditoria</h2>
          <span>{meta.totalItems} eventos</span>
        </div>
        <button type="button" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading}>
          Actualizar
        </button>
      </header>

      <form className={styles.auditFilters} onSubmit={applyFilters}>
        <label>Servicio<input value={draft.service ?? ""} onChange={(event) => update("service", event.target.value)} placeholder="ms-auth" /></label>
        <label>Nivel<select value={draft.level ?? ""} onChange={(event) => update("level", event.target.value as AuditLevel | "")}>
          <option value="">Todos</option>{levels.map((level) => <option key={level} value={level}>{level}</option>)}
        </select></label>
        <label>Acción<input value={draft.action ?? ""} onChange={(event) => update("action", event.target.value)} placeholder="USER_UPDATED" /></label>
        <label>Entidad<input value={draft.entity ?? ""} onChange={(event) => update("entity", event.target.value)} placeholder="User" /></label>
        <label>ID de entidad<input value={draft.entityId ?? ""} onChange={(event) => update("entityId", event.target.value)} /></label>
        <label>Actor<input value={draft.performedBy ?? ""} onChange={(event) => update("performedBy", event.target.value)} placeholder="ID de usuario" /></label>
        <label>Municipio<input value={draft.municipalityId ?? ""} onChange={(event) => update("municipalityId", event.target.value)} placeholder="funes" /></label>
        <label>Correlación<input value={draft.correlationId ?? ""} onChange={(event) => update("correlationId", event.target.value)} /></label>
        <label>Desde<input type="date" value={draft.from ?? ""} onChange={(event) => update("from", event.target.value)} /></label>
        <label>Hasta<input type="date" value={draft.to ?? ""} onChange={(event) => update("to", event.target.value)} /></label>
        <div className={styles.auditFilterActions}>
          <button type="submit" disabled={loading}>Aplicar filtros</button>
          <button type="button" onClick={clearFilters} disabled={loading}>Limpiar</button>
        </div>
      </form>

      {error ? <p className={styles.auditFeedback} role="alert">{error}</p> : null}
      {loading ? <p className={styles.auditFeedback} role="status">Cargando logs...</p> : null}
      {!loading && !error && entries.length === 0 ? <p className={styles.auditFeedback} role="status">No hay eventos para estos filtros.</p> : null}

      {!loading && entries.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead><tr><th>Fecha</th><th>Nivel</th><th>Servicio</th><th>Acción</th><th>Actor</th><th>Municipio</th><th>Entidad</th><th>Correlación</th><th>Detalle</th></tr></thead>
            <tbody>{entries.map((entry) => <AuditRow key={entry.id} entry={entry} />)}</tbody>
          </table>
        </div>
      ) : null}

      <nav className={styles.paginationRow} aria-label="Paginación de logs">
        <button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
        <span>Página {meta.totalPages === 0 ? 0 : page} de {meta.totalPages}</span>
        <button type="button" disabled={loading || page >= meta.totalPages} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
      </nav>
    </section>
  );
}