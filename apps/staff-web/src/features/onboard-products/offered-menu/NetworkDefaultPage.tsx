// Network default page: edit the network-level rules that every route
// inherits until overridden. Same layout as the Route detail page, but
// without mode tabs, flight picker, or "Set here" / "Reset to inherited".
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source */

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { PageHeader } from '@staff-web/features/onboard-products/ui'
import { useOnboardApi } from '@staff-web/features/onboard-products/api'
import type { Cabin, CabinSetting, Product, ProductOffering, SettingPatch } from '@staff-web/features/onboard-products/api/types'
import { resolveCabinSettings, resolveMenu } from '@staff-web/features/onboard-products/offered-menu/resolve'
import { CabinTile, MenuPanel, RulesForm } from './parts'

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

function cabinLabel(c: Cabin): string {
  if (c === 'economy') return 'Economy'
  if (c === 'premium_economy') return 'Premium economy'
  return 'Business'
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
  const api = useOnboardApi()
  const [settings, setSettings] = useState<CabinSetting[] | null>(null)
  const [offerings, setOfferings] = useState<ProductOffering[] | null>(null)
  const [mealProducts, setMealProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [cabin, setCabin] = useState<Cabin>('economy')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [original, setOriginal] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  function showToast(kind: 'success' | 'error' | 'info', message: string) {
    if (kind === 'success') toast.success(message)
    else if (kind === 'error') toast.error(message)
    else toast.info(message)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([api.offerings.getNetworkDefault(), api.products.list()])
      .then(([d, products]) => {
        if (cancelled) return
        setSettings(d.cabinSettings)
        setOfferings(d.offerings)
        setMealProducts(products.filter((p) => p.category === 'meal'))
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
  }, [api])

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

  if (loading && !settings) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (!settings || !offerings) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>Network default not found.</AlertDescription>
      </Alert>
    )
  }

  const resolved = resolveCabinSettings(settings, cabin, null, null)

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  // The menu also holds snacks, drinks and duty-free; the tiles and the menu panel count meals only.
  const mealsIn = (menu: { productId: string }[]) => menu.filter((o) => mealProducts.some((p) => p.id === o.productId)).length

  function cabinTileSubline(c: Cabin): string {
    const m = resolveMenu(offerings ?? [], c, null, null)
    if (mealsIn(m.menu) === 0) return '0 meals · no menu set'
    const def = m.menu.find((o) => o.id === m.defaultOfferingId)
    const defName = def ? mealProducts.find((p) => p.id === def.productId)?.name : null
    return defName ? `${mealsIn(m.menu)} meals · default ${defName}` : `${mealsIn(m.menu)} meals · standard menu`
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
      const result = await api.offerings.putCabinSettings('network', null, null, cabin, patch)
      showToast(
        'success',
        `Saved ${cabinLabel(cabin)} settings.${result.affectedOpenOrders > 0 ? ` ${result.affectedOpenOrders} open orders updated.` : ''}`,
      )
      const fresh = await api.offerings.getNetworkDefault()
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
      const input = {
        productId,
        scope: 'network' as const,
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
      ? api.offerings.updateProductOffering(existing.id, { isActive })
      : api.offerings.createProductOffering({
          productId,
          scope: 'network',
          routeId: null,
          flightId: null,
          cabin,
          isDefault: current.find((x) => x.cabin === cabin && x.isActive) == null,
          isActive,
        })

    work
      .then(() => api.offerings.getNetworkDefault())
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
    api.offerings
      .updateProductOffering(existing.id, { isDefault: true, isActive: true })
      .then(() => api.offerings.getNetworkDefault())
      .then((fresh) => {
        setSettings(fresh.cabinSettings)
        setOfferings(fresh.offerings)
      })
      .catch((err: unknown) => {
        showToast('error', err instanceof Error ? err.message : 'Could not change the default meal.')
      })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground">
          <Link to="/catering/offered-menu">
            <ArrowLeft aria-hidden="true" />
            Back to offered menu
          </Link>
        </Button>
        <PageHeader
          title="Network default"
          description="Starting rules that apply to every route until a route or single flight overrides them."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CABINS.map((c) => {
          const s = settings.find((x) => x.scope === 'network' && x.cabin === c) ?? null
          const summary = cabinSummary(s)
          return (
            <CabinTile
              key={c}
              name={cabinLabel(c)}
              badge="Default"
              headline={summary.headline}
              subline={cabinTileSubline(c)}
              active={cabin === c}
              onClick={() => setCabin(c)}
            />
          )
        })}
      </div>

      {draft && (
        <Card className="gap-5">
          <CardHeader>
            <CardTitle>{cabinLabel(cabin)} · rules and menu</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <RulesForm draft={draft} errors={errors} setField={setField} />
            <MenuPanel
              mealProducts={mealProducts}
              menu={effectiveMenu.menu}
              offeredCount={mealsIn(effectiveMenu.menu)}
              defaultOfferingId={effectiveMenu.defaultOfferingId}
              warning={warning}
              onToggle={handleToggleOffering}
              onSetDefault={(offeringId) => {
                const off = effectiveMenu.menu.find((o) => o.id === offeringId)
                const productId = off ? mealProducts.find((p) => p.id === off.productId)?.id : undefined
                if (productId) handleSetDefault(productId)
              }}
            />
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span className="text-sm text-muted-foreground">
              {resolved && <span>Network default — applies to every route until overridden.</span>}
            </span>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button asChild variant="outline">
                <Link to="/catering/offered-menu">Cancel</Link>
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
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
