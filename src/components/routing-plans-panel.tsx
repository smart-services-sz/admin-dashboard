"use client";

import { useEffect, useMemo, useState } from "react";
import { accessControlService, type ManagedUser } from "@/services/access-control.service";
import { routingService, type RoutingAreaPlan } from "@/services/routing.service";
import styles from "./routing-panel.module.css";

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

const EMPTY_FORM = {
  id: "",
  name: "",
  userId: "",
  categorias: [] as string[],
  originLat: -34.55,
  originLng: -58.45,
  dailyByUser: 15,
  dailyByCategory: 20,
};

type PlanFormState = typeof EMPTY_FORM;

function mapPlanToForm(plan: RoutingAreaPlan): PlanFormState {
  return {
    id: plan.id,
    name: plan.name,
    userId: plan.userId,
    categorias: plan.categorias,
    originLat: plan.originLat,
    originLng: plan.originLng,
    dailyByUser: plan.dailyByUser,
    dailyByCategory: plan.dailyByCategory,
  };
}

export function RoutingPlansPanel() {
  const [plans, setPlans] = useState<RoutingAreaPlan[]>([]);
  const [agentUsers, setAgentUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedArea, setSelectedArea] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);

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
    const normalizedSearch = search.trim().toLowerCase();
    return plans.filter((plan) => {
      const matchesSearch =
        !normalizedSearch ||
        plan.name.toLowerCase().includes(normalizedSearch) ||
        (plan.userName ?? "").toLowerCase().includes(normalizedSearch);
      const matchesArea = selectedArea === "all" || plan.categorias.includes(selectedArea);
      return matchesSearch && matchesArea;
    });
  }, [plans, search, selectedArea]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [plansResponse, usersResponse] = await Promise.all([
        routingService.getAreaPlans(),
        accessControlService.getActiveUsersByRole("AGENT"),
      ]);

      setPlans(plansResponse.data);
      setAgentUsers(usersResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los planes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setOkMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (plan: RoutingAreaPlan) => {
    setForm(mapPlanToForm(plan));
    setError(null);
    setOkMessage(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setForm(EMPTY_FORM);
  };

  const toggleCategoria = (categoria: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      categorias: checked
        ? [...current.categorias, categoria]
        : current.categorias.filter((item) => item !== categoria),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Asigna un nombre al plan.");
      return;
    }

    if (!form.userId) {
      setError("Selecciona un usuario operativo.");
      return;
    }

    if (form.categorias.length === 0) {
      setError("Selecciona al menos un area para el plan.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      const selectedUser = agentUsers.find((user) => user.id === form.userId);

      await routingService.saveAreaPlan({
        id: form.id || undefined,
        name: form.name.trim(),
        userId: form.userId,
        userName: selectedUser?.name ?? selectedUser?.email ?? null,
        categorias: form.categorias,
        originLat: form.originLat,
        originLng: form.originLng,
        dailyByUser: form.dailyByUser,
        dailyByCategory: form.dailyByCategory,
      });

      await loadData();
      setOkMessage(form.id ? "Plan actualizado." : "Plan creado.");
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el plan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (planId: string) => {
    setSubmitting(true);
    setError(null);
    setOkMessage(null);

    try {
      await routingService.deleteAreaPlan(planId);
      await loadData();
      setOkMessage("Plan eliminado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el plan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.stack}>
      <article className={styles.card}>
        <div className={styles.head}>
          <div>
            <h2>Planes de ruteo</h2>
            <span>Solo gestion de planes. El flujo de rutas se reconstruira despues.</span>
          </div>
          <button className={styles.buttonPrimary} type="button" onClick={openCreateModal} disabled={loading || submitting}>
            Nuevo plan
          </button>
        </div>

        <div className={styles.toolbarRow}>
          <label className={styles.field} htmlFor="plan-search">
            <span>Buscar plan</span>
            <input
              id="plan-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre del plan o usuario"
            />
          </label>

          <label className={styles.field} htmlFor="area-filter">
            <span>Filtrar por area</span>
            <select
              id="area-filter"
              className={styles.select}
              value={selectedArea}
              onChange={(event) => setSelectedArea(event.target.value)}
            >
              <option value="all">Todas</option>
              {availableAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
        </div>

        {okMessage && <div className={styles.statusOk}>{okMessage}</div>}
        {error && <div className={styles.statusError}>{error}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Areas</th>
                <th>Usuario</th>
                <th>Origen</th>
                <th>Limites</th>
                <th>Actualizado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Cargando planes...</td>
                </tr>
              ) : visiblePlans.length === 0 ? (
                <tr>
                  <td colSpan={7}>No hay planes para los filtros seleccionados.</td>
                </tr>
              ) : (
                visiblePlans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.name}</td>
                    <td>{plan.categorias.join(", ")}</td>
                    <td>{plan.userName || plan.userId}</td>
                    <td>{plan.originLat.toFixed(4)}, {plan.originLng.toFixed(4)}</td>
                    <td>{plan.dailyByUser} / {plan.dailyByCategory}</td>
                    <td>{new Date(plan.updatedAt).toLocaleString()}</td>
                    <td>
                      <div className={styles.actionsRow}>
                        <button className={styles.buttonSecondary} type="button" onClick={() => openEditModal(plan)} disabled={submitting}>
                          Editar
                        </button>
                        <button className={styles.buttonSecondary} type="button" onClick={() => void handleDelete(plan.id)} disabled={submitting}>
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
      </article>

      {isModalOpen && (
        <div className={styles.modalBackdrop} role="presentation" onClick={closeModal}>
          <div className={styles.modalPanel} role="dialog" aria-modal="true" aria-labelledby="routing-plan-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 id="routing-plan-modal-title">{form.id ? "Editar plan" : "Nuevo plan"}</h3>
                <p className={styles.subtle}>Define solo los datos base del plan. El flujo de rutas se armara despues.</p>
              </div>
              <button className={styles.buttonSecondary} type="button" onClick={closeModal}>
                Cerrar
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.fieldGrid}>
                <label className={styles.field} htmlFor="routing-plan-name">
                  <span>Nombre del plan</span>
                  <input
                    id="routing-plan-name"
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ej: Plan Alumbrado Norte"
                  />
                </label>

                <label className={styles.field} htmlFor="routing-plan-user">
                  <span>Usuario operativo</span>
                  <select
                    id="routing-plan-user"
                    className={styles.select}
                    value={form.userId}
                    onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
                  >
                    <option value="">Seleccionar</option>
                    {agentUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field} htmlFor="routing-plan-origin-lat">
                  <span>Origen latitud</span>
                  <input
                    id="routing-plan-origin-lat"
                    type="number"
                    step="0.000001"
                    value={form.originLat}
                    onChange={(event) => setForm((current) => ({ ...current, originLat: Number(event.target.value || 0) }))}
                  />
                </label>

                <label className={styles.field} htmlFor="routing-plan-origin-lng">
                  <span>Origen longitud</span>
                  <input
                    id="routing-plan-origin-lng"
                    type="number"
                    step="0.000001"
                    value={form.originLng}
                    onChange={(event) => setForm((current) => ({ ...current, originLng: Number(event.target.value || 0) }))}
                  />
                </label>

                <label className={styles.field} htmlFor="routing-plan-daily-user">
                  <span>Reclamos por usuario</span>
                  <input
                    id="routing-plan-daily-user"
                    type="number"
                    min={1}
                    value={form.dailyByUser}
                    onChange={(event) => setForm((current) => ({ ...current, dailyByUser: Number(event.target.value || 1) }))}
                  />
                </label>

                <label className={styles.field} htmlFor="routing-plan-daily-area">
                  <span>Reclamos por area</span>
                  <input
                    id="routing-plan-daily-area"
                    type="number"
                    min={1}
                    value={form.dailyByCategory}
                    onChange={(event) => setForm((current) => ({ ...current, dailyByCategory: Number(event.target.value || 1) }))}
                  />
                </label>
              </div>

              <div className={styles.formSection}>
                <h4 className={styles.sectionTitle}>Areas del plan</h4>
                <div className={styles.grid}>
                  {ROUTING_CATEGORY_OPTIONS.map((categoria) => {
                    const checked = form.categorias.includes(categoria);
                    return (
                      <label key={categoria} className={styles.checkbox}>
                        <input type="checkbox" checked={checked} onChange={(event) => toggleCategoria(categoria, event.target.checked)} />
                        <span>{categoria}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className={styles.actionsRow}>
                <button className={styles.buttonPrimary} type="button" onClick={handleSave} disabled={submitting}>
                  {form.id ? "Guardar cambios" : "Crear plan"}
                </button>
                <button className={styles.buttonSecondary} type="button" onClick={closeModal} disabled={submitting}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}