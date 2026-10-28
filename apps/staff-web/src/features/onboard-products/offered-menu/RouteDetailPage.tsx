// Route detail: edit a single route's menu and cabin rules. Three modes:
// Whole route (default), Single flight, or Network default. The layout
// mirrors the prototype: three cabin tiles at the top, a "rules and menu"
// panel below, with the settings on the left and the menu on the right.
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useOnboardApi } from '@staff-web/features/onboard-products/api'
import type {
  Cabin,
  CabinSetting,
  FlightException,
  Product,
  ProductOffering,
  RouteDetail,
  RouteSummary,
  SettingPatch,
} from '@staff-web/features/onboard-products/api/types'
import { resolveMenu } from '@staff-web/features/onboard-products/offered-menu/resolve'
import { Toast, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import { SegmentedControl } from './SegmentedControl'
import { ToggleSwitch } from './ToggleSwitch'
import styles from './RouteDetailPage.module.css'

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

type Mode = 'route' | 'flight' | 'network'

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

// Summarise a cabin's rules in a single line, e.g. "Complimentary · 1 included".
function cabinSummary(s: CabinSetting | null): { headline: string; subline: string } {
  if (!s) {
    return { headline: 'Inheriting network default', subline: 'No settings set here yet' }
  }
  const service = s.mealService ?? 'paid'
  const selection = s.mealSelection ?? 'choose'
  const included = s.includedPerPassenger ?? 0
  const headline =
    service === 'complimentary'
      ? `Complimentary · ${included} included`
      : service === 'paid'
        ? `Paid meals · ${selection === 'fixed' ? 'set meal' : 'passengers choose'}`
        : 'No meal service'
  const window = `order closes ${s.orderWindowHours ?? 48} h before`
  return { headline, subline: window }
}

export function RouteDetailPage() {
  const params = useParams({ from: '/_authenticated/catering/offered-menu/$routeId' })
  const search = useSearch({ from: '/_authenticated/catering/offered-menu/$routeId' })
  const routeId = params.routeId
  const navigate = useNavigate()
  const api = useOnboardApi()
  const [detail, setDetail] = useState<RouteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allExceptions, setAllExceptions] = useState<FlightException[]>([])
  const [allRoutes, setAllRoutes] = useState<RouteSummary[]>([])
  const [mealProducts, setMealProducts] = useState<Product[]>([])
  // Initial mode follows the URL: ?flight=... preselects Single flight mode.
  const [mode, setMode] = useState<Mode>(search.flight ? 'flight' : 'route')
  const [flightId, setFlightId] = useState<string | null>(null)
  const [cabin, setCabin] = useState<Cabin>('economy')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [original, setOriginal] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: nextToastId(), kind, message })
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([api.offerings.getRouteDetail(routeId), api.products.list()])
      .then(([d, products]) => {
        if (cancelled) return
        setDetail(d)
        setMealProducts(products.filter((p) => p.category === 'meal'))
        const wanted = search.flight && d.flights.some((f) => f.id === search.flight) ? search.flight : (d.flights[0]?.id ?? null)
        setFlightId(wanted)
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
  }, [routeId, search.flight, api])

  // Load every flight exception so the Single-flight picker can show all of them.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.offerings.listFlightExceptions({ search: '' }),
      api.offerings.listRoutes({ search: '', cabin: 'all', mealProductId: null, mealService: 'all', status: 'all' }),
    ])
      .then(([d, r]) => {
        if (cancelled) return
        setAllExceptions(d.exceptions)
        setAllRoutes(r.routes)
      })
      .catch(() => {
        /* ignore — the picker will fall back to this route's flights */
      })
    return () => {
      cancelled = true
    }
  }, [api])

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

  // The menu currently in effect, used for the chips and the default meal select.
  const effectiveMenu = useMemo(() => {
    if (!detail) return { menu: [] as ProductOffering[], defaultOfferingId: null as string | null, menuLevel: 'none' as const }
    return resolveMenu(detail.offerings, cabin, mode === 'route' ? routeId : null, mode === 'flight' ? flightId : null)
  }, [detail, cabin, mode, routeId, flightId])

  // The route shown in the page header. In flight mode the selected flight
  // may belong to a different route than the URL's `routeId`, so look it up
  // from the flight exception (or fall back to the current route).
  const headerRoute = useMemo(() => {
    if (mode === 'network') return null
    if (mode === 'flight' && flightId && detail) {
      const ex = allExceptions.find((e) => e.id === flightId) ?? detail.flights.find((f) => f.id === flightId)
      if (ex) {
        const m = allRoutes.find((r) => r.id === ex.routeId)
        if (m) return m
      }
    }
    return detail?.route ?? null
  }, [mode, flightId, allExceptions, allRoutes, detail])

  // Initialize the draft when the active row or cabin changes. (Sync setState
  // is intentional here — the draft mirrors an external source.)
  useEffect(() => {
    const d = settingToDraft(activeRow)
    setDraft(d)
    setOriginal(d)
    setErrors({})
  }, [activeRow, cabin])

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
  const isFlight = mode === 'flight'

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  // Decide which flights to show in the Single-flight picker: every flight
  // exception across the network, or just this route's flights if the global
  // list is still loading.
  const flightPickerOptions: FlightException[] =
    isFlight && allExceptions.length > 0
      ? allExceptions
      : flights.map((f) => ({
          id: f.id,
          flightNumber: f.flightNumber,
          routeId: routeId,
          scheduledDeparture: f.scheduledDeparture,
          cabin: cabin,
          changedSettings: [],
          route: '',
        }))

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
      const result = await api.offerings.putCabinSettings(
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
      const fresh = await api.offerings.getRouteDetail(routeId)
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
      await api.offerings.resetCabinSettingsToInherited(mode, mode === 'route' ? routeId : null, mode === 'flight' ? flightId : null, cabin)
      showToast('success', `${cabinLabel(cabin)} reset to inherited.`)
      const fresh = await api.offerings.getRouteDetail(routeId)
      setDetail(fresh)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not reset.')
    } finally {
      setSaving(false)
    }
  }

  // Optimistic toggle: update the local offerings immediately so the chip
  // changes without waiting for the round trip; revert on failure.
  function handleToggleOffering(productId: string, isActive: boolean) {
    if (!detail) return
    const currentOfferings = detail.offerings
    setDetail((d) => {
      if (!d) return d
      const existing = d.offerings.find((o) => o.productId === productId && o.cabin === cabin && matchesScope(o, mode, routeId, flightId))
      let nextOfferings: ProductOffering[]
      if (existing) {
        nextOfferings = d.offerings.map((o) => (o.id === existing.id ? { ...o, isActive } : o))
      } else {
        const input: Omit<ProductOffering, 'id'> = {
          productId,
          scope: isNetwork ? 'network' : mode,
          routeId: isNetwork ? null : routeId,
          flightId: mode === 'flight' ? flightId : null,
          cabin,
          isDefault: d.offerings.find((o) => o.cabin === cabin && o.isActive) == null,
          isActive,
        }
        nextOfferings = [...d.offerings, { id: `optimistic-${Date.now()}`, ...input }]
      }
      return { ...d, offerings: nextOfferings }
    })

    const existing = currentOfferings.find(
      (o) => o.productId === productId && o.cabin === cabin && matchesScope(o, mode, routeId, flightId),
    )
    const work = existing
      ? api.offerings.updateProductOffering(existing.id, { isActive })
      : api.offerings.createProductOffering({
          productId,
          scope: isNetwork ? 'network' : mode,
          routeId: isNetwork ? null : routeId,
          flightId: mode === 'flight' ? flightId : null,
          cabin,
          isDefault: defaultMealId(effectiveMenu.menu) == null,
          isActive,
        })

    work
      .then(() => api.offerings.getRouteDetail(routeId))
      .then((fresh) => setDetail(fresh))
      .catch((err: unknown) => {
        setDetail((d) => {
          if (!d) return d
          const next = d.offerings.map((o) => (o.productId === productId && o.cabin === cabin ? { ...o, isActive: !isActive } : o))
          return { ...d, offerings: next }
        })
        showToast('error', err instanceof Error ? err.message : 'Could not update menu.')
      })
  }

  function handleSetDefault(productId: string) {
    setDetail((d) => {
      if (!d) return d
      const next = d.offerings.map((o) => {
        if (o.cabin !== cabin) return o
        if (!matchesScope(o, mode, routeId, flightId)) return o
        if (o.productId === productId) return { ...o, isDefault: true, isActive: true }
        return { ...o, isDefault: false }
      })
      return { ...d, offerings: next }
    })

    const existing = effectiveMenu.menu.find((o) => o.productId === productId)
    if (!existing) return
    api.offerings
      .updateProductOffering(existing.id, { isDefault: true, isActive: true })
      .then(() => api.offerings.getRouteDetail(routeId))
      .then((fresh) => setDetail(fresh))
      .catch((err: unknown) => {
        showToast('error', err instanceof Error ? err.message : 'Could not change the default meal.')
      })
  }

  // Helper: is the value at the current level or inherited?
  // The summary text below each cabin tile: "5 meals · default Green curry chicken".
  function cabinTileSubline(c: Cabin): string {
    if (!detail) return ''
    const m = resolveMenu(detail.offerings, c, mode === 'route' ? routeId : null, mode === 'flight' ? flightId : null)
    if (m.menu.length === 0) return '0 meals · no menu set'
    const def = m.menu.find((o) => o.id === m.defaultOfferingId)
    const defName = def ? mealProducts.find((p) => p.id === def.productId)?.name : null
    return defName ? `${m.menu.length} meals · default ${defName}` : `${m.menu.length} meals · standard menu`
  }

  // Whether the cabin's value is at the current level (route/flight) or inherited.
  function isCustom(c: Cabin): boolean {
    if (!detail) return false
    if (mode === 'network') return false
    if (mode === 'flight' && flightId) {
      return detail.cabinSettings.some((s) => s.scope === 'flight' && s.flightId === flightId && s.cabin === c)
    }
    return detail.cabinSettings.some((s) => s.scope === 'route' && s.routeId === routeId && s.cabin === c)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link to="/catering/offered-menu" className={styles.backLink}>
            ← Back to offered menu
          </Link>
          <h1 className={styles.title}>
            {headerRoute ? `${headerRoute.originAirport} → ${headerRoute.destinationAirport}` : 'Network default'}
          </h1>
          {headerRoute && (
            <p className={styles.subtitle}>
              {headerRoute.originCity} to {headerRoute.destinationCity}
            </p>
          )}
          {isNetwork && (
            <p className={styles.subtitle}>Starting rules that apply to every route until a route or single flight overrides them.</p>
          )}
          {isFlight && (
            <p className={styles.subtitle}>
              {flightId
                ? (() => {
                    const f = allExceptions.find((e) => e.id === flightId) ?? flights.find((x) => x.id === flightId)
                    return f ? `${f.flightNumber} · ${formatDate(f.scheduledDeparture)}` : ''
                  })()
                : 'Pick a flight to edit its overrides.'}
            </p>
          )}
        </div>
        <div className={styles.modeSwitch} role="tablist" aria-label="Mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'route'}
            className={mode === 'route' ? styles.modeActive : styles.modeButton}
            onClick={() => setMode('route')}
            disabled={route == null}
          >
            Whole route
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'flight'}
            className={mode === 'flight' ? styles.modeActive : styles.modeButton}
            onClick={() => setMode('flight')}
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

      {isFlight && flightPickerOptions.length > 0 && (
        <div className={styles.flightPicker}>
          <label className={styles.flightPickerLabel} htmlFor="flight-picker">
            Flight
          </label>
          <select id="flight-picker" className={styles.flightSelect} value={flightId ?? ''} onChange={(e) => setFlightId(e.target.value)}>
            {flightPickerOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.flightNumber} · {formatDate(f.scheduledDeparture)} · {routeCodeFromId(f.routeId)}
              </option>
            ))}
          </select>
          {flightId && (
            <span className={styles.flightSummary}>
              {(() => {
                const picked = flightPickerOptions.find((f) => f.id === flightId)
                if (!picked) return ''
                const labels = picked.changedSettings.map(humaniseField).filter(Boolean)
                return labels.length > 0 ? `Overrides: ${labels.join(', ')}` : 'Standard flight'
              })()}
            </span>
          )}
        </div>
      )}

      <div className={styles.cabinTiles}>
        {CABINS.map((c) => {
          const s = activeCabinSetting(detail, c, mode, routeId, flightId)
          const summary = cabinSummary(s)
          const sub = cabinTileSubline(c)
          const custom = isCustom(c)
          return (
            <button
              key={c}
              type="button"
              className={cabin === c ? styles.cabinTileActive : styles.cabinTile}
              onClick={() => setCabin(c)}
              aria-pressed={cabin === c}
            >
              <div className={styles.cabinTileHeader}>
                <span className={styles.cabinTileName}>{cabinLabel(c)}</span>
                {isNetwork ? (
                  <span className={styles.inheritedBadge}>Default</span>
                ) : custom ? (
                  <span className={styles.customBadge}>Custom</span>
                ) : (
                  <span className={styles.inheritedBadge}>Inherited</span>
                )}
              </div>
              <p className={styles.cabinTileHeadline}>{summary.headline}</p>
              <p className={styles.cabinTileSubline}>{sub}</p>
            </button>
          )
        })}
      </div>

      {draft && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{cabinLabel(cabin)} · rules and menu</h2>
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
          </div>

          <div className={styles.panelBody}>
            <div className={styles.settingsColumn}>
              <p className={styles.sectionHeader}>Meals</p>
              <Field label="Meal service" description="Whether meals are free, paid or not served." error={errors.mealService}>
                <SegmentedControl
                  ariaLabel="Meal service"
                  value={draft.mealService}
                  onChange={(v) => setField('mealService', v as Draft['mealService'])}
                  options={[
                    { value: 'complimentary', label: 'Complimentary' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'none', label: 'None' },
                  ]}
                />
              </Field>

              <Field label="Meal selection" description="Whether passengers pick their meal.">
                <SegmentedControl
                  ariaLabel="Meal selection"
                  value={draft.mealSelection}
                  onChange={(v) => setField('mealSelection', v as Draft['mealSelection'])}
                  disabled={draft.mealService === 'none'}
                  options={[
                    { value: 'choose', label: 'Passengers choose' },
                    { value: 'fixed', label: 'Fixed meal, no choice' },
                  ]}
                />
              </Field>

              <Field
                label="Included meals per passenger"
                description="Meals each passenger gets at no charge."
                error={errors.includedPerPassenger}
              >
                <SegmentedControl
                  ariaLabel="Included meals per passenger"
                  value={draft.includedPerPassenger}
                  onChange={(v) => setField('includedPerPassenger', v)}
                  options={[
                    { value: 0, label: '0' },
                    { value: 1, label: '1' },
                    { value: 2, label: '2' },
                    { value: 3, label: '3' },
                  ]}
                />
              </Field>

              <p className={styles.sectionHeader}>Ordering</p>

              <Field label="Pre-order in the shop" description="Let passengers buy before the flight.">
                <ToggleSwitch
                  ariaLabel="Pre-order in the shop"
                  checked={draft.preorderEnabled}
                  onChange={(v) => setField('preorderEnabled', v)}
                />
              </Field>

              <Field label="Order closes before departure" description="Cutoff for the catering order." error={errors.orderWindowHours}>
                <SegmentedControl
                  ariaLabel="Order window"
                  value={[24, 48, 72].includes(draft.orderWindowHours) ? draft.orderWindowHours : 48}
                  onChange={(v) => setField('orderWindowHours', v)}
                  options={[
                    { value: 24, label: '24 hours' },
                    { value: 48, label: '48 hours' },
                    { value: 72, label: '72 hours' },
                  ]}
                />
              </Field>

              <Field label="On-board buffer" description="Extra meals loaded to cover no-shows." error={errors.onboardBufferPercent}>
                <SegmentedControl
                  ariaLabel="On-board buffer"
                  value={[0, 5, 10, 15, 20].includes(draft.onboardBufferPercent) ? draft.onboardBufferPercent : 10}
                  onChange={(v) => setField('onboardBufferPercent', v)}
                  options={[
                    { value: 0, label: '0%' },
                    { value: 5, label: '5%' },
                    { value: 10, label: '10%' },
                    { value: 15, label: '15%' },
                    { value: 20, label: '20%' },
                  ]}
                />
              </Field>

              <p className={styles.sectionHeader}>Extras</p>

              <Field label="Snacks and drinks" description="Light snacks and beverages between meals.">
                <ToggleSwitch ariaLabel="Snacks" checked={draft.snacksEnabled} onChange={(v) => setField('snacksEnabled', v)} />
              </Field>

              <Field label="Duty-free" description="Allow duty-free sales in this cabin.">
                <ToggleSwitch ariaLabel="Duty-free" checked={draft.dutyFreeEnabled} onChange={(v) => setField('dutyFreeEnabled', v)} />
              </Field>

              <Field label="Premium meals allowed" description="Passengers can pick premium meals.">
                <ToggleSwitch
                  ariaLabel="Premium meals allowed"
                  checked={draft.premiumMealsAllowed}
                  onChange={(v) => setField('premiumMealsAllowed', v)}
                />
              </Field>
            </div>

            <div className={styles.menuColumn}>
              <p className={styles.menuTitle}>Menu</p>
              <p className={styles.menuSubtitle}>
                {effectiveMenu.menu.length === 0
                  ? 'No menu for this cabin — turn meals on below to add them.'
                  : `${effectiveMenu.menu.length} of ${mealProducts.length} meals offered. Tap a meal to offer or withdraw it.`}
              </p>
              <div className={styles.chips}>
                {mealProducts.map((p) => {
                  const active = effectiveMenu.menu.some((o) => o.productId === p.id && o.isActive)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={active ? styles.chipActive : styles.chip}
                      onClick={() => handleToggleOffering(p.id, !active)}
                    >
                      <span className={styles.chipIcon}>{active ? '✓' : '+'}</span>
                      <span className={styles.chipName}>{p.name}</span>
                      {p.isPremium && <span className={styles.premium}>Premium</span>}
                    </button>
                  )
                })}
              </div>

              <p className={styles.defaultMealHeader}>Default meal (if a passenger orders nothing)</p>
              <select
                className={styles.defaultMealSelect}
                value={effectiveMenu.defaultOfferingId ?? ''}
                onChange={(e) => {
                  const productId = mealProducts.find(
                    (p) => p.id === effectiveMenu.menu.find((o) => o.id === e.target.value)?.productId,
                  )?.id
                  if (productId) handleSetDefault(productId)
                }}
              >
                {effectiveMenu.menu.length === 0 && <option value="">No meals offered</option>}
                {effectiveMenu.menu.map((o) => {
                  const p = mealProducts.find((mp) => mp.id === o.productId)
                  return (
                    <option key={o.id} value={o.id}>
                      {p?.name ?? 'Unknown meal'}
                    </option>
                  )
                })}
              </select>

              {warning && (
                <p className={styles.warning} role="alert">
                  {warning}
                </p>
              )}
            </div>
          </div>

          <footer className={styles.actions}>
            <div className={styles.inheritanceInfo}>
              {!isNetwork && (
                <span>
                  {isCustom(cabin) ? 'Custom for this ' + mode : `Inherited from ${mode === 'flight' ? 'this flight' : 'network'}`}
                </span>
              )}
            </div>
            <div className={styles.actionButtons}>
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

interface FieldProps {
  label: string
  description: string
  error?: string
  children: React.ReactNode
}

function Field({ label, description, error, children }: FieldProps) {
  // The per-field "Set here" / "Inherited from network" indicator was removed;
  // a single status line at the bottom of the panel now tells the user
  // whether the whole cabin is custom or inherited.
  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldRowLabel}>
        <span className={styles.fieldRowTitle}>{label}</span>
        <span className={styles.fieldRowDescription}>{description}</span>
        {error && <span className={styles.error}>{error}</span>}
      </div>
      <div className={styles.fieldRowControl}>{children}</div>
    </div>
  )
}

function activeCabinSetting(detail: RouteDetail, c: Cabin, mode: Mode, routeId: string, flightId: string | null): CabinSetting | null {
  if (mode === 'network') return detail.cabinSettings.find((s) => s.scope === 'network' && s.cabin === c) ?? null
  if (mode === 'flight' && flightId) {
    return detail.cabinSettings.find((s) => s.scope === 'flight' && s.flightId === flightId && s.cabin === c) ?? null
  }
  return detail.cabinSettings.find((s) => s.scope === 'route' && s.routeId === routeId && s.cabin === c) ?? null
}

function matchesScope(o: ProductOffering, mode: Mode, routeId: string, flightId: string | null): boolean {
  if (mode === 'network') return o.scope === 'network'
  if (mode === 'flight') return o.scope === 'flight' && o.flightId === flightId
  return o.scope === 'route' && o.routeId === routeId
}

function defaultMealId(menu: ProductOffering[]): string | null {
  const d = menu.find((o) => o.isDefault)
  return d ? d.id : null
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

function humaniseField(name: string): string {
  if (name === 'mealService') return 'meal service'
  if (name === 'mealSelection') return 'meal selection'
  if (name === 'includedPerPassenger') return 'included meals'
  if (name === 'preorderEnabled') return 'pre-order'
  if (name === 'orderWindowHours') return 'order window'
  if (name === 'premiumMealsAllowed') return 'premium meals'
  if (name === 'snacksEnabled') return 'snacks'
  if (name === 'dutyFreeEnabled') return 'duty-free'
  if (name === 'onboardBufferPercent') return 'on-board buffer'
  return name
}

function routeCodeFromId(id: string): string {
  return id.replace('r-', '').toUpperCase()
}
