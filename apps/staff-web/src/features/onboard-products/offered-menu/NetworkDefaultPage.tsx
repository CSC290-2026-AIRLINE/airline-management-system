// Thin wrapper that renders Route detail pre-set to Network default mode.
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source */

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Toast, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import {
  getNetworkDefault,
  putCabinSettings,
  createProductOffering,
  updateProductOffering,
} from '@staff-web/features/onboard-products/api/offerings'
import type { Cabin, CabinSetting, ProductOffering, SettingPatch } from '@staff-web/features/onboard-products/api/types'
import { mockProducts } from '@staff-web/features/onboard-products/mocks/products'
import { resolveCabinSettings, resolveMenu } from '@staff-web/features/onboard-products/offered-menu/resolve'
import styles from './RouteDetailPage.module.css'

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

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

export function NetworkDefaultPage() {
  const [settings, setSettings] = useState<CabinSetting[] | null>(null)
  const [offerings, setOfferings] = useState<ProductOffering[] | null>(null)
  const [loading, setLoading] = useState(true)
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
    const map: Record<string, boolean> = {}
    for (const o of effectiveMenu.menu) map[o.productId] = o.isActive
    setMenuActive(map)
    setDefaultOfferingId(effectiveMenu.defaultOfferingId)
  }, [effectiveMenu])

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

  async function handleToggleOffering(productId: string, isActive: boolean) {
    const existing = effectiveMenu.menu.find((o) => o.productId === productId)
    try {
      if (existing) {
        await updateProductOffering(existing.id, { isActive })
      } else {
        await createProductOffering({
          productId,
          scope: 'network',
          routeId: null,
          flightId: null,
          cabin,
          isDefault: defaultOfferingId == null,
          isActive,
        })
      }
      const fresh = await getNetworkDefault()
      setSettings(fresh.cabinSettings)
      setOfferings(fresh.offerings)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not update menu.')
    }
  }

  async function handleSetDefault(productId: string) {
    const existing = effectiveMenu.menu.find((o) => o.productId === productId)
    if (!existing) return
    try {
      await updateProductOffering(existing.id, { isDefault: true, isActive: true })
      const fresh = await getNetworkDefault()
      setSettings(fresh.cabinSettings)
      setOfferings(fresh.offerings)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not change the default meal.')
    }
  }

  // The network page has no "Reset to inherited" — the network is the floor.

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

function sectionLabel(s: Section): string {
  if (s === 'meals') return 'Meals'
  if (s === 'ordering') return 'Ordering'
  return 'Extras'
}

function guessField(message: string): string | null {
  if (/included meals/i.test(message)) return 'includedPerPassenger'
  if (/order window/i.test(message)) return 'orderWindowHours'
  if (/on-board buffer/i.test(message)) return 'onboardBufferPercent'
  if (/premium economy/i.test(message)) return 'mealService'
  if (/meal service/i.test(message)) return 'mealService'
  return null
}
