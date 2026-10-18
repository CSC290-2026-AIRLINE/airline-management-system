// Network default page: edit the network-level rules that every route
// inherits until overridden. Same layout as the Route detail page, but
// without mode tabs, flight picker, or "Set here" / "Reset to inherited".
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source */

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Toast, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import {
  getNetworkDefault,
  putCabinSettings,
  createProductOffering,
  updateProductOffering,
  type ProductOfferingInput,
} from '@staff-web/features/onboard-products/api/offerings'
import type { Cabin, CabinSetting, ProductOffering, SettingPatch } from '@staff-web/features/onboard-products/api/types'
import { mockProducts } from '@staff-web/features/onboard-products/mocks/products'
import { resolveCabinSettings, resolveMenu } from '@staff-web/features/onboard-products/offered-menu/resolve'
import { SegmentedControl } from './SegmentedControl'
import { ToggleSwitch } from './ToggleSwitch'
import styles from './RouteDetailPage.module.css'

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

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

export function NetworkDefaultPage() {
  const [settings, setSettings] = useState<CabinSetting[] | null>(null)
  const [offerings, setOfferings] = useState<ProductOffering[] | null>(null)
  const [loading, setLoading] = useState(true)
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
    getNetworkDefault()
      .then((d) => {
        if (cancelled) return
        setSettings(d.cabinSettings)
        setOfferings(d.offerings)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        showToast('error', err instanceof Error ? err.message : 'Could not load the network default.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeRow = settings?.find((s) => s.scope === 'network' && s.cabin === cabin) ?? null
  const effectiveMenu = useMemo(() => resolveMenu(offerings ?? [], cabin, null, null), [offerings, cabin])

  useEffect(() => {
    if (!settings) return
    const d = settingToDraft(activeRow)
    setDraft(d)
    setOriginal(d)
    setErrors({})
  }, [activeRow, settings, cabin])

  useEffect(() => {
    if (!draft) return
    if (draft.mealService === 'none' && draft.includedPerPassenger === 0) {
      const seed = `network:::${cabin}`
      let h = 0
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
      setWarning(
        `Setting meal service to None with 0 included will leave ${(h % 12) + 1} open catering orders without a default. Those orders will need a manual override.`,
      )
    } else {
      setWarning(null)
    }
  }, [draft, cabin])

  if (loading && !settings) return <p className={styles.message}>Loading network default…</p>
  if (!settings || !offerings) return <p className={styles.error}>Network default not found.</p>

  const resolved = resolveCabinSettings(settings, cabin, null, null)

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  function cabinTileSubline(c: Cabin): string {
    const m = resolveMenu(offerings ?? [], c, null, null)
    if (m.menu.length === 0) return '0 meals · no menu set'
    const def = m.menu.find((o) => o.id === m.defaultOfferingId)
    const defName = def ? mockProducts.find((p) => p.id === def.productId)?.name : null
    return defName ? `${m.menu.length} meals · default ${defName}` : `${m.menu.length} meals · standard menu`
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
      const result = await putCabinSettings('network', null, null, cabin, patch)
      showToast(
        'success',
        `Saved ${cabinLabel(cabin)} settings.${result.affectedOpenOrders > 0 ? ` ${result.affectedOpenOrders} open orders updated.` : ''}`,
      )
      const fresh = await getNetworkDefault()
      setSettings(fresh.cabinSettings)
      setOfferings(fresh.offerings)
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

  // Optimistic toggle: update offerings immediately; revert on failure.
  function handleToggleOffering(productId: string, isActive: boolean) {
    const current = offerings ?? []
    setOfferings((o) => {
      if (!o) return o
      const existing = o.find((x) => x.productId === productId && x.cabin === cabin && x.scope === 'network')
      if (existing) {
        return o.map((x) => (x.id === existing.id ? { ...x, isActive } : x))
      }
      const input: ProductOfferingInput = {
        productId,
        scope: 'network',
        routeId: null,
        flightId: null,
        cabin,
        isDefault: o.find((x) => x.cabin === cabin && x.isActive) == null,
        isActive,
      }
      return [...o, { id: `optimistic-${Date.now()}`, ...input }]
    })

    const existing = current.find((x) => x.productId === productId && x.cabin === cabin && x.scope === 'network')
    const work = existing
      ? updateProductOffering(existing.id, { isActive })
      : createProductOffering({
          productId,
          scope: 'network',
          routeId: null,
          flightId: null,
          cabin,
          isDefault: current.find((x) => x.cabin === cabin && x.isActive) == null,
          isActive,
        })

    work
      .then(() => getNetworkDefault())
      .then((fresh) => {
        setSettings(fresh.cabinSettings)
        setOfferings(fresh.offerings)
      })
      .catch((err: unknown) => {
        setOfferings((o) => {
          if (!o) return o
          return o.map((x) => (x.productId === productId && x.cabin === cabin ? { ...x, isActive: !isActive } : x))
        })
        showToast('error', err instanceof Error ? err.message : 'Could not update menu.')
      })
  }

  function handleSetDefault(productId: string) {
    setOfferings((o) => {
      if (!o) return o
      return o.map((x) => {
        if (x.cabin !== cabin) return x
        if (x.scope !== 'network') return x
        if (x.productId === productId) return { ...x, isDefault: true, isActive: true }
        return { ...x, isDefault: false }
      })
    })

    const existing = effectiveMenu.menu.find((o) => o.productId === productId)
    if (!existing) return
    updateProductOffering(existing.id, { isDefault: true, isActive: true })
      .then(() => getNetworkDefault())
      .then((fresh) => {
        setSettings(fresh.cabinSettings)
        setOfferings(fresh.offerings)
      })
      .catch((err: unknown) => {
        showToast('error', err instanceof Error ? err.message : 'Could not change the default meal.')
      })
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link to="/catering/offered-menu" className={styles.backLink}>
            ← Back to offered menu
          </Link>
          <h1 className={styles.title}>Network default</h1>
          <p className={styles.subtitle}>Starting rules that apply to every route until a route or single flight overrides them.</p>
        </div>
      </header>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      <div className={styles.cabinTiles}>
        {CABINS.map((c) => {
          const s = settings.find((x) => x.scope === 'network' && x.cabin === c) ?? null
          const summary = cabinSummary(s)
          const sub = cabinTileSubline(c)
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
                <span className={styles.inheritedBadge}>Default</span>
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
          </div>

          <div className={styles.panelBody}>
            <div className={styles.settingsColumn}>
              <p className={styles.sectionHeader}>Meals</p>

              <PlainField label="Meal service" description="Whether meals are free, paid or not served." error={errors.mealService}>
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
              </PlainField>

              <PlainField label="Meal selection" description="Whether passengers pick their meal.">
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
              </PlainField>

              <PlainField
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
              </PlainField>

              <p className={styles.sectionHeader}>Ordering</p>

              <PlainField label="Pre-order in the shop" description="Let passengers buy before the flight.">
                <ToggleSwitch
                  ariaLabel="Pre-order in the shop"
                  checked={draft.preorderEnabled}
                  onChange={(v) => setField('preorderEnabled', v)}
                />
              </PlainField>

              <PlainField
                label="Order closes before departure"
                description="Cutoff for the catering order."
                error={errors.orderWindowHours}
              >
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
              </PlainField>

              <PlainField label="On-board buffer" description="Extra meals loaded to cover no-shows." error={errors.onboardBufferPercent}>
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
              </PlainField>

              <p className={styles.sectionHeader}>Extras</p>

              <PlainField label="Snacks and drinks" description="Light snacks and beverages between meals.">
                <ToggleSwitch ariaLabel="Snacks" checked={draft.snacksEnabled} onChange={(v) => setField('snacksEnabled', v)} />
              </PlainField>

              <PlainField label="Duty-free" description="Allow duty-free sales in this cabin.">
                <ToggleSwitch ariaLabel="Duty-free" checked={draft.dutyFreeEnabled} onChange={(v) => setField('dutyFreeEnabled', v)} />
              </PlainField>

              <PlainField label="Premium meals allowed" description="Passengers can pick premium meals.">
                <ToggleSwitch
                  ariaLabel="Premium meals allowed"
                  checked={draft.premiumMealsAllowed}
                  onChange={(v) => setField('premiumMealsAllowed', v)}
                />
              </PlainField>
            </div>

            <div className={styles.menuColumn}>
              <p className={styles.menuTitle}>Menu</p>
              <p className={styles.menuSubtitle}>
                {effectiveMenu.menu.length === 0
                  ? 'No menu for this cabin — turn meals on below to add them.'
                  : `${effectiveMenu.menu.length} of ${mockProducts.filter((p) => p.category === 'meal').length} meals offered. Tap a meal to offer or withdraw it.`}
              </p>
              <div className={styles.chips}>
                {mockProducts
                  .filter((p) => p.category === 'meal')
                  .map((p) => {
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
                  const off = effectiveMenu.menu.find((o) => o.id === e.target.value)
                  const productId = off ? mockProducts.find((p) => p.id === off.productId)?.id : undefined
                  if (productId) handleSetDefault(productId)
                }}
              >
                {effectiveMenu.menu.length === 0 && <option value="">No meals offered</option>}
                {effectiveMenu.menu.map((o) => {
                  const p = mockProducts.find((mp) => mp.id === o.productId)
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
              {resolved && <span>Network default — applies to every route until overridden.</span>}
            </div>
            <div className={styles.actionButtons}>
              <button type="button" className={styles.primaryButton} onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <Link to="/catering/offered-menu" className={styles.linkButton}>
                Cancel
              </Link>
            </div>
          </footer>
        </section>
      )}
    </div>
  )
}

interface PlainFieldProps {
  label: string
  description: string
  error?: string
  children: React.ReactNode
}

function PlainField({ label, description, error, children }: PlainFieldProps) {
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

function guessField(message: string): string | null {
  if (/included meals/i.test(message)) return 'includedPerPassenger'
  if (/order window/i.test(message)) return 'orderWindowHours'
  if (/on-board buffer/i.test(message)) return 'onboardBufferPercent'
  if (/premium economy/i.test(message)) return 'mealService'
  if (/meal service/i.test(message)) return 'mealService'
  return null
}
