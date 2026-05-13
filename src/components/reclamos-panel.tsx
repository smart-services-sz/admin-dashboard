"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import {
  reclamosService,
  type Reclamo,
  type ReclamoEstado,
  type ReclamoCategoria,
  type ReclamoPrioridad,
  type UpdateReclamoPayload,
  ESTADO_LABELS,
  CATEGORIA_LABELS,
  PRIORIDAD_LABELS,
} from "@/services/reclamos.service";
import styles from "./admin-dashboard.module.css";

const ALL_ESTADOS = Object.keys(ESTADO_LABELS) as ReclamoEstado[];
const ALL_CATEGORIAS = Object.keys(CATEGORIA_LABELS) as ReclamoCategoria[];

type EditForm = {
  estado: ReclamoEstado;
  prioridad: ReclamoPrioridad;
  observaciones: string;
};

function emptyEditForm(reclamo: Reclamo): EditForm {
  return {
    estado: reclamo.estado,
    prioridad: reclamo.prioridad,
    observaciones: reclamo.observaciones ?? "",
  };
}

export function ReclamosPanel() {
  const { hasPermission, hasRole } = useAuth();
  const canManage = hasPermission("MANAGE_RECLAMOS") || hasRole("ADMIN");
  const canDelete = hasPermission("DELETE_RECLAMOS") || hasRole("ADMIN");

  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterEstado, setFilterEstado] = useState<ReclamoEstado | "">("");
  const [filterCategoria, setFilterCategoria] = useState<ReclamoCategoria | "">("");
  const [filterSearch, setFilterSearch] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const LIMIT = 20;

  const fetchReclamos = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await reclamosService.getReclamos({
          page: p,
          limit: LIMIT,
          estado: filterEstado || undefined,
          categoria: filterCategoria || undefined,
          codigoSeguimiento: filterSearch.trim().startsWith("REC")
            ? filterSearch.trim()
            : undefined,
          contactKey: filterSearch.trim() && !filterSearch.trim().startsWith("REC")
            ? filterSearch.trim()
            : undefined,
        });
        setReclamos(result.items);
        setTotalItems(result.pagination.totalItems);
        setTotalPages(result.pagination.totalPages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar reclamos");
      } finally {
        setLoading(false);
      }
    },
    [filterEstado, filterCategoria, filterSearch],
  );

  useEffect(() => {
    setPage(1);
  }, [filterEstado, filterCategoria, filterSearch]);

  useEffect(() => {
    fetchReclamos(page);
  }, [fetchReclamos, page]);

  const startEdit = (reclamo: Reclamo) => {
    setEditingId(reclamo.id);
    setEditForm(emptyEditForm(reclamo));
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setSaveError(null);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId || !editForm) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload: UpdateReclamoPayload = {
        estado: editForm.estado,
        prioridad: editForm.prioridad,
        observaciones: editForm.observaciones,
      };
      await reclamosService.updateReclamo(editingId, payload);
      cancelEdit();
      await fetchReclamos(page);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este reclamo? Esta acción no se puede deshacer.")) return;
    try {
      await reclamosService.deleteReclamo(id);
      if (editingId === id) cancelEdit();
      await fetchReclamos(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  const pendientes = reclamos.filter((r) => r.estado === "pendiente").length;
  const enProceso = reclamos.filter((r) => r.estado === "en_proceso").length;
  const resueltos = reclamos.filter((r) => r.estado === "resuelto").length;

  return (
    <>
      <section className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <p>Total (página)</p>
          <strong>{totalItems}</strong>
        </article>
        <article className={styles.metricCard}>
          <p>Pendientes</p>
          <strong>{pendientes}</strong>
        </article>
        <article className={styles.metricCard}>
          <p>En proceso</p>
          <strong>{enProceso}</strong>
        </article>
        <article className={styles.metricCard}>
          <p>Resueltos</p>
          <strong>{resueltos}</strong>
        </article>
      </section>

      {/* Filters */}
      <div className={styles.reclamosFilters}>
        <input
          type="text"
          placeholder="Buscar por código REC- o contactKey..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          className={styles.reclamosSearchInput}
        />
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value as ReclamoEstado | "")}
          className={styles.reclamosFilterSelect}
        >
          <option value="">Todos los estados</option>
          {ALL_ESTADOS.map((e) => (
            <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
          ))}
        </select>
        <select
          value={filterCategoria}
          onChange={(e) => setFilterCategoria(e.target.value as ReclamoCategoria | "")}
          className={styles.reclamosFilterSelect}
        >
          <option value="">Todas las categorías</option>
          {ALL_CATEGORIAS.map((c) => (
            <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>
          ))}
        </select>
        <button
          type="button"
          className={styles.cancelInlineButton}
          onClick={() => fetchReclamos(page)}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {error && (
        <div className={styles.noticeBanner} data-tone="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <section className={styles.contentGrid}>
        {/* List */}
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <h2>Listado de reclamos</h2>
            <span>{totalItems} registros</span>
          </header>

          {loading && reclamos.length === 0 && (
            <p style={{ padding: "12px", color: "var(--text-muted)" }}>Cargando...</p>
          )}

          {!loading && reclamos.length === 0 && (
            <p style={{ padding: "12px", color: "var(--text-muted)" }}>
              No se encontraron reclamos con los filtros actuales.
            </p>
          )}

          <div className={styles.complaintsList}>
            {reclamos.map((item) => (
              <article
                key={item.id}
                className={styles.complaintCard}
                data-selected={editingId === item.id}
              >
                <div className={styles.complaintTopRow}>
                  <span className={styles.trackingCode}>{item.codigoSeguimiento}</span>
                  <span
                    className={styles.statusPill}
                    data-status={item.estado.replace("_", "-")}
                  >
                    {ESTADO_LABELS[item.estado]}
                  </span>
                </div>

                <h3 title={item.problema}>
                  {item.problema.length > 80
                    ? `${item.problema.slice(0, 80)}…`
                    : item.problema}
                </h3>

                <p>{item.direccion}</p>

                <div className={styles.complaintMeta}>
                  <span>{CATEGORIA_LABELS[item.categoria]}</span>
                  <span>Prioridad: {PRIORIDAD_LABELS[item.prioridad]}</span>
                  <span>Canal: {item.canal}</span>
                  <span>{new Date(item.creadoEn).toLocaleDateString("es-AR")}</span>
                </div>

                {item.observaciones && (
                  <p className={styles.reclamoObservaciones}>
                    <em>Obs: {item.observaciones}</em>
                  </p>
                )}

                <div className={styles.actionsRow}>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => (editingId === item.id ? cancelEdit() : startEdit(item))}
                    >
                      {editingId === item.id ? "Cancelar" : "Editar"}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => handleDelete(item.id)}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.paginationRow}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente →
              </button>
            </div>
          )}
        </article>

        {/* Edit panel */}
        {canManage && editingId && editForm && (
          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2>Editar reclamo</h2>
              <button
                className={styles.cancelInlineButton}
                type="button"
                onClick={cancelEdit}
              >
                Cancelar
              </button>
            </header>

            <form className={styles.form} onSubmit={handleSave}>
              <label>
                Estado
                <select
                  value={editForm.estado}
                  onChange={(e) =>
                    setEditForm((f) => f && { ...f, estado: e.target.value as ReclamoEstado })
                  }
                >
                  {ALL_ESTADOS.map((e) => (
                    <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
                  ))}
                </select>
              </label>

              <label>
                Prioridad
                <select
                  value={editForm.prioridad}
                  onChange={(e) =>
                    setEditForm((f) => f && { ...f, prioridad: e.target.value as ReclamoPrioridad })
                  }
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </label>

              <label>
                Observaciones
                <textarea
                  rows={4}
                  value={editForm.observaciones}
                  onChange={(e) =>
                    setEditForm((f) => f && { ...f, observaciones: e.target.value })
                  }
                  placeholder="Notas internas del agente..."
                />
              </label>

              {saveError && (
                <div className={styles.noticeBanner} data-tone="error">
                  {saveError}
                </div>
              )}

              <button
                className={styles.submitButton}
                type="submit"
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </form>
          </article>
        )}
      </section>
    </>
  );
}
