'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  MunicipalityConfiguration,
  MunicipalityRule,
  municipalConfigService,
} from '@/services/municipal-config.service';
import styles from './admin-dashboard.module.css';

const categories = [
  ['agua_y_cloacas', 'Agua y cloacas'],
  ['alumbrado', 'Alumbrado'],
  ['baches_y_pavimento', 'Baches y pavimento'],
  ['arbolado', 'Arbolado'],
  ['residuos', 'Residuos'],
  ['electricidad', 'Electricidad'],
  ['gas', 'Gas'],
  ['transporte', 'Transporte'],
  ['infraestructura', 'Infraestructura'],
  ['otros', 'Otros'],
] as const;

function emptyMunicipality(): MunicipalityConfiguration {
  return {
    id: '',
    name: '',
    country: 'Argentina',
    province: '',
    defaultCity: '',
    timezone: 'America/Argentina/Buenos_Aires',
    allowedCountries: ['Argentina'],
    allowedAdminAreas: [],
    isActive: true,
    areas: [],
    categories: [],
    neighborhoods: [],
    rules: [],
  };
}

function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function MunicipalConfigPanel() {
  const [municipalities, setMunicipalities] = useState<MunicipalityConfiguration[]>([]);
  const [draft, setDraft] = useState<MunicipalityConfiguration>(emptyMunicipality);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newRuleKey, setNewRuleKey] = useState('');
  const [newRuleValue, setNewRuleValue] = useState('{}');

  async function loadMunicipalities(selectId?: string) {
    setLoading(true);
    setError('');
    try {
      const result = await municipalConfigService.list(true);
      setMunicipalities(result);
      const selected = result.find((item) => item.id === selectId) ?? result[0];
      setDraft(selected ? { ...selected } : emptyMunicipality());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los municipios.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMunicipalities();
  }, []);

  function update<K extends keyof MunicipalityConfiguration>(
    key: K,
    value: MunicipalityConfiguration[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateRule(index: number, patch: Partial<MunicipalityRule>) {
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await municipalConfigService.save(draft);
      await loadMunicipalities(saved.id);
      setNotice('Configuración municipal guardada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.contentGrid} aria-busy={loading || saving}>
      <article className={styles.panel}>
        <header className={styles.panelHeader}>
          <h2>Municipios</h2>
          <button
            className={styles.cancelInlineButton}
            type="button"
            onClick={() => {
              setDraft(emptyMunicipality());
              setNotice('');
              setError('');
            }}
          >
            Nuevo municipio
          </button>
        </header>
        {loading ? (
          <p role="status">Cargando municipios...</p>
        ) : municipalities.length > 0 ? (
          <div className={styles.form}>
            {municipalities.map((municipality) => (
              <button
                key={municipality.id}
                type="button"
                className={styles.cancelInlineButton}
                aria-pressed={draft.id === municipality.id}
                onClick={() => setDraft({ ...municipality })}
              >
                {municipality.name} · {municipality.id} · {municipality.isActive ? 'Activo' : 'Inactivo'}
              </button>
            ))}
          </div>
        ) : (
          <p>No hay municipios configurados.</p>
        )}
      </article>

      <article className={styles.panel}>
        <header className={styles.panelHeader}>
          <h2>{draft.id ? `Configuración · ${draft.name}` : 'Nuevo municipio'}</h2>
        </header>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <form className={styles.form} onSubmit={(event) => void save(event)}>
          <label>
            Identificador municipal (slug)
            <input required pattern="[a-z0-9]+(?:_[a-z0-9]+)*" value={draft.id} disabled={municipalities.some((item) => item.id === draft.id)} onChange={(event) => update('id', toSlug(event.target.value))} />
          </label>
          <label>Nombre<input required maxLength={160} value={draft.name} onChange={(event) => update('name', event.target.value)} /></label>
          <label>País<input required maxLength={120} value={draft.country} onChange={(event) => update('country', event.target.value)} /></label>
          <label>Provincia<input value={draft.province ?? ''} onChange={(event) => update('province', event.target.value)} /></label>
          <label>Ciudad para geocodificación<input value={draft.defaultCity ?? ''} onChange={(event) => update('defaultCity', event.target.value)} /></label>
          <label>Zona horaria<input required value={draft.timezone} onChange={(event) => update('timezone', event.target.value)} /></label>
          <label>Países permitidos (separados por coma)<input value={draft.allowedCountries.join(', ')} onChange={(event) => update('allowedCountries', event.target.value.split(',').map((part) => part.trim()).filter(Boolean))} /></label>
          <label>Áreas geográficas permitidas (separadas por coma)<input value={draft.allowedAdminAreas.join(', ')} onChange={(event) => update('allowedAdminAreas', event.target.value.split(',').map((part) => part.trim()).filter(Boolean))} /></label>
          <label>
            <input type="checkbox" checked={draft.isActive} onChange={(event) => update('isActive', event.target.checked)} />
            Municipio activo
          </label>

          <fieldset>
            <legend>Áreas</legend>
            {draft.areas.map((area, index) => (
              <div key={area.slug} className={styles.form}>
                <input aria-label={`Nombre de área ${area.slug}`} value={area.name} onChange={(event) => update('areas', draft.areas.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                <code>{area.slug}</code>
                <label><input type="checkbox" checked={area.isActive} onChange={(event) => update('areas', draft.areas.map((item, itemIndex) => itemIndex === index ? { ...item, isActive: event.target.checked } : item))} /> Activa</label>
              </div>
            ))}
            <div className={styles.actionsRow}>
              <input aria-label="Nueva área" value={newArea} onChange={(event) => setNewArea(event.target.value)} placeholder="Nombre del área" />
              <button type="button" onClick={() => { if (!newArea.trim()) return; const slug = toSlug(newArea); update('areas', [...draft.areas, { slug, name: newArea.trim(), isActive: true }]); setNewArea(''); }}>Agregar área</button>
            </div>
          </fieldset>

          <fieldset>
            <legend>Categorías</legend>
            {draft.categories.map((category, index) => (
              <div key={category.code} className={styles.form}>
                <code>{category.code}</code>
                <input aria-label={`Nombre de categoría ${category.code}`} value={category.name} onChange={(event) => update('categories', draft.categories.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                <select aria-label={`Prioridad de ${category.code}`} value={category.defaultPriority} onChange={(event) => update('categories', draft.categories.map((item, itemIndex) => itemIndex === index ? { ...item, defaultPriority: event.target.value as 'alta' | 'media' | 'baja' } : item))}>
                  <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                </select>
                <label><input type="checkbox" checked={category.isActive} onChange={(event) => update('categories', draft.categories.map((item, itemIndex) => itemIndex === index ? { ...item, isActive: event.target.checked } : item))} /> Activa</label>
              </div>
            ))}
            <div className={styles.actionsRow}>
              <select aria-label="Nueva categoría" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}>
                <option value="">Seleccionar categoría</option>
                {categories.filter(([code]) => !draft.categories.some((item) => item.code === code)).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
              <button type="button" disabled={!newCategory} onClick={() => { const selected = categories.find(([code]) => code === newCategory); if (!selected) return; update('categories', [...draft.categories, { code: selected[0], name: selected[1], defaultPriority: 'media', isActive: true }]); setNewCategory(''); }}>Agregar categoría</button>
            </div>
          </fieldset>

          <fieldset>
            <legend>Barrios</legend>
            {draft.neighborhoods.map((neighborhood, index) => (
              <div key={neighborhood.slug} className={styles.actionsRow}>
                <input aria-label={`Nombre de barrio ${neighborhood.slug}`} value={neighborhood.name} onChange={(event) => update('neighborhoods', draft.neighborhoods.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                <select aria-label={`Área de ${neighborhood.slug}`} value={neighborhood.areaSlug ?? ''} onChange={(event) => update('neighborhoods', draft.neighborhoods.map((item, itemIndex) => itemIndex === index ? { ...item, areaSlug: event.target.value || undefined } : item))}>
                  <option value="">Sin área</option>{draft.areas.map((area) => <option key={area.slug} value={area.slug}>{area.name}</option>)}
                </select>
                <label><input type="checkbox" checked={neighborhood.isActive} onChange={(event) => update('neighborhoods', draft.neighborhoods.map((item, itemIndex) => itemIndex === index ? { ...item, isActive: event.target.checked } : item))} /> Activo</label>
              </div>
            ))}
            <div className={styles.actionsRow}>
              <input aria-label="Nuevo barrio" value={newNeighborhood} onChange={(event) => setNewNeighborhood(event.target.value)} placeholder="Nombre del barrio" />
              <button type="button" disabled={!newNeighborhood.trim()} onClick={() => { const name = newNeighborhood.trim(); update('neighborhoods', [...draft.neighborhoods, { slug: toSlug(name), name, isActive: true }]); setNewNeighborhood(''); }}>Agregar barrio</button>
            </div>
          </fieldset>

          <fieldset>
            <legend>Reglas municipales (JSON)</legend>
            {draft.rules.map((rule, index) => (
              <div key={rule.key} className={styles.form}>
                <code>{rule.key}</code>
                <textarea aria-label={`Valor JSON de ${rule.key}`} value={JSON.stringify(rule.value, null, 2)} onChange={(event) => { try { const value = JSON.parse(event.target.value) as Record<string, unknown>; update('rules', draft.rules.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item)); } catch { /* Keep last valid JSON while the user edits. */ } }} />
                <label><input type="checkbox" checked={rule.isActive} onChange={(event) => update('rules', draft.rules.map((item, itemIndex) => itemIndex === index ? { ...item, isActive: event.target.checked } : item))} /> Activa</label>
              </div>
            ))}
            <div className={styles.actionsRow}>
              <input aria-label="Clave de regla" value={newRuleKey} onChange={(event) => setNewRuleKey(toSlug(event.target.value))} placeholder="Clave de regla" />
              <input aria-label="Valor JSON de nueva regla" value={newRuleValue} onChange={(event) => setNewRuleValue(event.target.value)} />
              <button type="button" disabled={!newRuleKey} onClick={() => { try { const value = JSON.parse(newRuleValue) as Record<string, unknown>; update('rules', [...draft.rules, { key: newRuleKey, value, isActive: true }]); setNewRuleKey(''); setNewRuleValue('{}'); } catch { setError('El valor de la regla debe ser JSON válido.'); } }}>Agregar regla</button>
            </div>
          </fieldset>

          <button className={styles.submitButton} type="submit" disabled={saving || !draft.id.trim()}>
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </form>
      </article>
    </section>
  );
}