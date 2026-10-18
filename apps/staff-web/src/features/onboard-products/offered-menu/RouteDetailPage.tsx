// Route detail: edit a single route's menu and cabin rules. Three modes:
// Whole route (default), Single flight, or Network default. The
// segmented control + cabin tile header switches which set of values
// the form edits.
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  createProductOffering,
  getRouteDetail,
  putCabinSettings,
  resetCabinSettingsToInherited,
  updateProductOffering,
} from '@staff-web/features/onboard-products/api/offerings'
import type { Cabin, CabinSetting, ProductOffering, RouteDetail, SettingPatch } from '@staff-web/features/onboard-products/api/types'
import { mockProducts } from '@staff-web/features/onboard-products/mocks/products'
import { resolveCabinSettings, resolveMenu } from '@staff-web/features/onboard-products/offered-menu/resolve'
import { Toast, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import styles from './RouteDetailPage.module.css'

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

type Mode = 'route' | 'flight' | 'network'
type Section = 'meals' | 'ordering' | 'extras'

interface Draft {
  mealService: 'complimentary' | 'paid' | 'none'
  mealSelection: 'choose' | 'fixed'
  includedPerPassenger: number
  preorderEnabled: boolean
  orderWindowHours: number
  premiumMealsAllowed: boolean
  snacksEnabled: boolean
  dutyFreeEnabled: boolean
  onboardBufferPercent: number
}

function nextToastId(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function cabinLabel(c: Cabin): string {
  if (c === 'economy') return 'Economy'
  if (c === 'premium_economy') return 'Premium economy'
  if (c === 'business') return 'Business'
  return 'First'
}

function settingToDraft(s: CabinSetting | null): Draft {
  return {
    mealService: (s?.mealService ?? 'paid') as Draft['mealService'],
    mealSelection: (s?.mealSelection ?? 'choose') as Draft['mealSelection'],
    includedPerPassenger: s?.includedPerPassenger ?? 0,
    preorderEnabled: s?.preorderEnabled ?? true,
    orderWindowHours: s?.orderWindowHours ?? 48,
    premiumMealsAllowed: s?.premiumMealsAllowed ?? true,
    snacksEnabled: s?.snacksEnabled ?? true,
    dutyFreeEnabled: s?.dutyFreeEnabled ?? true,
    onboardBufferPercent: s?.onboardBufferPercent ?? 10,
  }
}

function draftToPatch(d: Draft, original: Draft): SettingPatch {
  const patch: SettingPatch = {}
  for (const k of Object.keys(d) as (keyof Draft)[]) {
    if (d[k] !== original[k]) {
      ;(patch as Record<string, unknown>)[k] = d[k]
    }
  }
  return patch
}

export function RouteDetailPage() {
  const params = useParams({ from: '/_authenticated/catering/offered-menu/$routeId' })
  const routeId = params.routeId
  const navigate = useNavigate()
  const [detail, setDetail] = useState<RouteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('route')
  const [flightId, setFlightId] = useState<string | null>(null)
  const [cabin, setCabin] = useState<Cabin>('economy')
  const [section, setSection] = useState<Section>('meals')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [original, setOriginal] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [menuActive, setMenuActive] = useState<Record<string, boolean>>({})
  const [defaultOfferingId, setDefaultOfferingId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: nextToastId(), kind, message })
  }

  useEffect(() => {
    let cancelled = false
    getRouteDetail(routeId)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        if (d.flights.length > 0) setFlightId(d.flights[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the route.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [routeId])

  // Active setting row (the one to edit) — depends on mode + cabin.
  const activeRow = useMemo<CabinSetting | null>(() => {
    if (!detail) return null
    if (mode === 'network') {
      return detail.cabinSettings.find((s) => s.scope === 'network' && s.cabin === cabin) ?? null
    }
    if (mode === 'flight' && flightId) {
      return detail.cabinSettings.find((s) => s.scope === 'flight' && s.flightId === flightId && s.cabin === cabin) ?? null
    }
    return detail.cabinSettings.find((s) => s.scope === 'route' && s.routeId === routeId && s.cabin === cabin) ?? null
  }, [detail, mode, flightId, routeId, cabin])

  // Resolved values, used for the "Inherited from ..." labels and warnings.
  const resolved = useMemo(() => {
    if (!detail) return null
    return resolveCabinSettings(detail.cabinSettings, cabin, mode === 'route' ? routeId : null, mode === 'flight' ? flightId : null)
  }, [detail, cabin, mode, routeId, flightId])

  // The menu currently in effect, used for the Meals section chip list.
  const effectiveMenu = useMemo(() => {
    if (!detail) return { menu: [] as ProductOffering[], defaultOfferingId: null as string | null, menuLevel: 'none' as const }
    return resolveMenu(detail.offerings, cabin, mode === 'route' ? routeId : null, mode === 'flight' ? flightId : null)
  }, [detail, cabin, mode, routeId, flightId])

  // Initialize the draft when the active row or cabin changes. (Sync setState
  // is intentional here — the draft mirrors an external source.)

  useEffect(() => {
    if (!activeRow && !resolved) return
    const d = settingToDraft(activeRow)
    setDraft(d)
    setOriginal(d)
    setErrors({})
  }, [activeRow, resolved, cabin])

  // Build the per-product active map whenever the menu changes. (Sync setState
  // is intentional — menuActive mirrors an external source.)

  useEffect(() => {
    const map: Record<string, boolean> = {}
    for (const o of effectiveMenu.menu) {
      map[o.productId] = o.isActive
    }
    setMenuActive(map)
    setDefaultOfferingId(effectiveMenu.defaultOfferingId)
  }, [effectiveMenu])

  // Surface the meal_service=none warning whenever the draft turns it on.
  // (Sync setState is intentional — mirrors a derivation of the draft state.)

  useEffect(() => {
    if (!draft) return
    if (draft.mealService === 'none' && draft.includedPerPassenger === 0) {
      const seed = `${mode}:${routeId}:${flightId ?? ''}:${cabin}`
      let h = 0
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
      setWarning(
        `Setting meal service to None with 0 included will leave ${(h % 12) + 1} open catering orders without a default. Those orders will need a manual override.`,
      )
    } else {
      setWarning(null)
    }
  }, [draft, mode, routeId, flightId, cabin])

  if (loading && !detail) return <p className={styles.message}>Loading route…</p>
  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    )
  }
  if (!detail) return <p className={styles.error}>Route not found.</p>

  const route = detail.route
  const flights = detail.flights
  const isNetwork = mode === 'network'

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  async function handleSave() {
    if (!draft || !original) return
    setErrors({})
    const patch = draftToPatch(draft, original)
    if (Object.keys(patch).length === 0) {
      showToast('info', 'No changes to save.')
      return
    }
    setSaving(true)
    try {
      const result = await putCabinSettings(
        isNetwork ? 'network' : mode,
        isNetwork ? null : routeId,
        mode === 'flight' ? flightId : null,
        cabin,
        patch,
      )
      showToast(
        'success',
        `Saved ${cabinLabel(cabin)} settings.${result.affectedOpenOrders > 0 ? ` ${result.affectedOpenOrders} open orders updated.` : ''}`,
      )
      // Reload the detail to reflect merged state.
      const fresh = await getRouteDetail(routeId)
      setDetail(fresh)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save.'
      const code = (err as { code?: string }).code
      if (code === 'SETTING_INVALID' || code === 'MEAL_POLICY_INVALID') {
        const next: Record<string, string> = {}
        const field = guessField(message)
        if (field) next[field] = message
        setErrors(next)
      } else {
        showToast('error', message)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleResetInherited() {
    if (isNetwork) return
    if (mode === 'flight' && !flightId) return
    setSaving(true)
    try {
      await resetCabinSettingsToInherited(mode, mode === 'route' ? routeId : null, mode === 'flight' ? flightId : null, cabin)
      showToast('success', `${cabinLabel(cabin)} reset to inherited.`)
      const fresh = await getRouteDetail(routeId)
      setDetail(fresh)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not reset.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleOffering(productId: string, isActive: boolean) {
    // Find or create the offering at the current scope for this product.
    const existing = effectiveMenu.menu.find((o) => o.productId === productId)
    try {
      if (existing) {
        await updateProductOffering(existing.id, { isActive })
      } else {
        await createProductOffering({
          productId,
          scope: isNetwork ? 'network' : mode,
          routeId: isNetwork ? null : routeId,
          flightId: mode === 'flight' ? flightId : null,
          cabin,
          isDefault: defaultOfferingId == null,
          isActive,
        })
      }
      const fresh = await getRouteDetail(routeId)
      setDetail(fresh)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not update menu.')
    }
  }

  async function handleSetDefault(productId: string) {
    const existing = effectiveMenu.menu.find((o) => o.productId === productId)
    if (!existing) return
    try {
      await updateProductOffering(existing.id, { isDefault: true, isActive: true })
      const fresh = await getRouteDetail(routeId)
      setDetail(fresh)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not change the default meal.')
    }
  }

  const networkSetting = isNetwork ? activeRow : (detail.cabinSettings.find((s) => s.scope === 'network' && s.cabin === cabin) ?? null)
  void networkSetting

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link to="/catering/offered-menu" className={styles.backLink}>
            ← Back to offered menu
          </Link>
          <h1 className={styles.title}>{route ? `${route.originAirport} → ${route.destinationAirport}` : 'Network default'}</h1>
          {route && (
            <p className={styles.subtitle}>
              {route.originCity} to {route.destinationCity}
            </p>
          )}
          {isNetwork && (
            <p className={styles.subtitle}>Starting rules that apply to every route until a route or single flight overrides them.</p>
          )}
        </div>
        <div className={styles.modeSwitch} role="tablist" aria-label="Mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'route'}
            className={mode === 'route' ? styles.modeActive : styles.modeButton}
            onClick={() => setMode('route')}
            disabled={isNetwork || route == null}
          >
            Whole route
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'flight'}
            className={mode === 'flight' ? styles.modeActive : styles.modeButton}
            onClick={() => setMode('flight')}
            disabled={isNetwork || flights.length === 0}
          >
            Single flight
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'network'}
            className={mode === 'network' ? styles.modeActive : styles.modeButton}
            onClick={() => setMode('network')}
          >
            Network default
          </button>
        </div>
      </header>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      {mode === 'flight' && flights.length > 0 && (
        <div className={styles.flightPicker}>
          <label className={styles.flightPickerLabel} htmlFor="flight-picker">
            Flight
          </label>
          <select id="flight-picker" className={styles.flightSelect} value={flightId ?? ''} onChange={(e) => setFlightId(e.target.value)}>
            {flights.map((f) => (
              <option key={f.id} value={f.id}>
                {f.flightNumber} · {formatDate(f.scheduledDeparture)}
              </option>
            ))}
          </select>
          {flightId && <span className={styles.flightSummary}>{flights.find((f) => f.id === flightId)?.exceptionSummary}</span>}
        </div>
      )}

      <nav className={styles.cabinTabs} aria-label="Cabin">
        {CABINS.map((c) => (
          <button
            key={c}
            type="button"
            className={cabin === c ? styles.cabinTabActive : styles.cabinTab}
            onClick={() => setCabin(c)}
            aria-pressed={cabin === c}
          >
            {cabinLabel(c)}
            {!isNetwork && activeCabinHasCustom(detail, c, mode, routeId, flightId) && (
              <span className={styles.customDot} aria-label="Custom">
                •
              </span>
            )}
          </button>
        ))}
      </nav>

      <nav className={styles.sections} aria-label="Section">
        {(['meals', 'ordering', 'extras'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={section === s ? styles.sectionActive : styles.sectionButton}
            onClick={() => setSection(s)}
            aria-pressed={section === s}
          >
            {sectionLabel(s)}
          </button>
        ))}
      </nav>

      {draft && (
        <section className={styles.panel}>
          {section === 'meals' && (
            <div className={styles.sectionBody}>
              <div className={styles.fieldGroup}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Meal service</span>
                  <select
                    className={styles.input}
                    value={draft.mealService}
                    onChange={(e) => setField('mealService', e.target.value as Draft['mealService'])}
                  >
                    <option value="complimentary">Complimentary</option>
                    <option value="paid">Paid</option>
                    <option value="none">None</option>
                  </select>
                  {errors.mealService && <span className={styles.error}>{errors.mealService}</span>}
                  {isNetwork && <span className={styles.fieldHint}>Affects every route until overridden.</span>}
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Meal selection</span>
                  <select
                    className={styles.input}
                    value={draft.mealSelection}
                    onChange={(e) => setField('mealSelection', e.target.value as Draft['mealSelection'])}
                    disabled={draft.mealService === 'none'}
                  >
                    <option value="choose">Passengers choose</option>
                    <option value="fixed">Set meal</option>
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Included meals per passenger</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={1}
                    step={1}
                    value={draft.includedPerPassenger}
                    onChange={(e) => setField('includedPerPassenger', Number(e.target.value))}
                  />
                  {errors.includedPerPassenger && <span className={styles.error}>{errors.includedPerPassenger}</span>}
                </label>
              </div>

              <div>
                <p className={styles.subHeader}>Menu</p>
                <p className={styles.subSubheader}>
                  {effectiveMenu.menu.length === 0
                    ? 'No menu for this cabin — turn meals on below to add them.'
                    : `${effectiveMenu.menu.length} meals in this cabin.`}
                </p>
                <div className={styles.chips}>
                  {mockProducts
                    .filter((p) => p.category === 'meal')
                    .map((p) => {
                      const active = !!menuActive[p.id]
                      const isDefault = effectiveMenu.menu.find((o) => o.productId === p.id)?.id === defaultOfferingId
                      return (
                        <div key={p.id} className={active ? styles.chipActive : styles.chip}>
                          <label className={styles.chipRow}>
                            <input type="checkbox" checked={active} onChange={(e) => void handleToggleOffering(p.id, e.target.checked)} />
                            <span className={styles.chipName}>{p.name}</span>
                            {p.isPremium && <span className={styles.premium}>Premium</span>}
                          </label>
                          {active && (
                            <label className={styles.chipDefaultRow}>
                              <input type="radio" name="default-meal" checked={isDefault} onChange={() => void handleSetDefault(p.id)} />
                              <span>Default</span>
                            </label>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>

              {warning && (
                <p className={styles.warning} role="alert">
                  {warning}
                </p>
              )}
            </div>
          )}

          {section === 'ordering' && (
            <div className={styles.sectionBody}>
              <div className={styles.fieldGroup}>
                <label className={styles.checkboxField}>
                  <input type="checkbox" checked={draft.preorderEnabled} onChange={(e) => setField('preorderEnabled', e.target.checked)} />
                  <span>Pre-order in the shop</span>
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Order window (hours before departure)</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={1}
                    value={draft.orderWindowHours}
                    onChange={(e) => setField('orderWindowHours', Number(e.target.value))}
                  />
                  {errors.orderWindowHours && <span className={styles.error}>{errors.orderWindowHours}</span>}
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>On-board buffer (%)</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.onboardBufferPercent}
                    onChange={(e) => setField('onboardBufferPercent', Number(e.target.value))}
                  />
                  {errors.onboardBufferPercent && <span className={styles.error}>{errors.onboardBufferPercent}</span>}
                </label>
              </div>
            </div>
          )}

          {section === 'extras' && (
            <div className={styles.sectionBody}>
              <div className={styles.fieldGroup}>
                <label className={styles.checkboxField}>
                  <input type="checkbox" checked={draft.snacksEnabled} onChange={(e) => setField('snacksEnabled', e.target.checked)} />
                  <span>Snacks</span>
                </label>
                <label className={styles.checkboxField}>
                  <input type="checkbox" checked={draft.dutyFreeEnabled} onChange={(e) => setField('dutyFreeEnabled', e.target.checked)} />
                  <span>Duty-free</span>
                </label>
                <label className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={draft.premiumMealsAllowed}
                    onChange={(e) => setField('premiumMealsAllowed', e.target.checked)}
                  />
                  <span>Premium meals allowed</span>
                </label>
              </div>
            </div>
          )}

          <footer className={styles.actions}>
            <div className={styles.inheritanceInfo}>
              {resolved && <span>{inheritanceLabel(resolved.mealService.level, mode, routeId, flightId)}</span>}
            </div>
            <div className={styles.actionButtons}>
              {!isNetwork && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleResetInherited()}
                  disabled={saving || !activeRow}
                >
                  Reset to inherited
                </button>
              )}
              <button type="button" className={styles.primaryButton} onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => navigate({ to: '/catering/offered-menu' })}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </footer>
        </section>
      )}
    </div>
  )
}

function activeCabinHasCustom(detail: RouteDetail, c: Cabin, mode: Mode, routeId: string, flightId: string | null): boolean {
  if (mode === 'network') return false
  if (mode === 'flight' && flightId) {
    return detail.cabinSettings.some((s) => s.scope === 'flight' && s.flightId === flightId && s.cabin === c)
  }
  return detail.cabinSettings.some((s) => s.scope === 'route' && s.routeId === routeId && s.cabin === c)
}

function sectionLabel(s: Section): string {
  if (s === 'meals') return 'Meals'
  if (s === 'ordering') return 'Ordering'
  return 'Extras'
}

function inheritanceLabel(level: 'flight' | 'route' | 'network' | 'none', mode: Mode, routeId: string, flightId: string | null): string {
  if (level === 'flight') return 'Inherited from this flight'
  if (level === 'route' && mode !== 'route') return `Inherited from route ${routeId}`
  if (level === 'network') return 'Inherited from network default'
  if (level === 'none') return 'No value set'
  void flightId
  return 'This value is set at the current level'
}

function guessField(message: string): string | null {
  if (/included meals/i.test(message)) return 'includedPerPassenger'
  if (/order window/i.test(message)) return 'orderWindowHours'
  if (/on-board buffer/i.test(message)) return 'onboardBufferPercent'
  if (/premium economy/i.test(message)) return 'mealService'
  if (/meal service/i.test(message)) return 'mealService'
  return null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}
