// Network default page: edit the network-level rules that every route
// inherits until overridden. Same layout as the Route detail page, but
// without mode tabs, flight picker, or "Set here" / "Reset to inherited".
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { PageHeader } from '@staff-web/features/onboard-products/ui'
import { useOnboardApi } from '@staff-web/features/onboard-products/api'
import type { Cabin, CabinSetting, Product, ProductOffering, SettingPatch } from '@staff-web/features/onboard-products/api/types'
import { resolveCabinSettings, resolveMenu } from '@staff-web/features/onboard-products/offered-menu/resolve'
import { CabinTile, MenuPanel, RulesForm } from './parts'
import { useMenuDraft } from './useMenuDraft'

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

interface Draft {
  mealService: 'complimentary' | 'paid' | 'none'
  mealSelection: 'choose' | 'fixed'
  includedPerPassenger: number
  preorderEnabled: boolean
  orderWindowHours: number
  premiumMealsAllowed: boolean
  snacksService: 'complimentary' | 'paid' | 'none'
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
    snacksService: s?.snacksEnabled === false ? 'none' : s?.snacksComplimentary ? 'complimentary' : 'paid',
    dutyFreeEnabled: s?.dutyFreeEnabled ?? true,
    onboardBufferPercent: s?.onboardBufferPercent ?? 10,
  }
}

function draftToPatch(d: Draft, original: Draft): SettingPatch {
  const patch: SettingPatch = {}
  for (const k of Object.keys(d) as (keyof Draft)[]) {
    if (d[k] === original[k]) continue
    if (k === 'snacksService') {
      patch.snacksEnabled = d.snacksService !== 'none'
      patch.snacksComplimentary = d.snacksService === 'complimentary'
    } else {
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
  const navigate = useNavigate()
  const [settings, setSettings] = useState<CabinSetting[] | null>(null)
  const [offerings, setOfferings] = useState<ProductOffering[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const mealProducts = products.filter((product) => product.category === 'meal')
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
        setProducts(products.filter((product) => product.isActive))
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
  const menuCabin = cabin === 'premium_economy' ? 'economy' : cabin
  const menuDraft = useMenuDraft(menuCabin, effectiveMenu.menu, mealProducts)

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
  const mealsIn = (menu: ProductOffering[]) => menu.filter((o) => o.isActive && mealProducts.some((p) => p.id === o.productId)).length

  function cabinTileSubline(c: Cabin): string {
    const m = resolveMenu(offerings ?? [], c, null, null)
    if (mealsIn(m.menu) === 0) return '0 meals · no menu set'
    const def = m.menu.find((o) => o.id === m.defaultOfferingId)
    const defName = def ? mealProducts.find((p) => p.id === def.productId)?.name : null
    return defName ? `${mealsIn(m.menu)} meals · default ${defName}` : `${mealsIn(m.menu)} meals · standard menu`
  }

  async function handleSave() {
    if (!draft || !original || saving) return
    setErrors({})
    const patch = draftToPatch(draft, original)
    const hasSettings = Object.keys(patch).length > 0
    if (!hasSettings && menuDraft.changes.length === 0) {
      showToast('info', 'No changes to save.')
      return
    }
    setSaving(true)
    try {
      let affectedOpenOrders = 0
      if (hasSettings) {
        const result = await api.offerings.putCabinSettings('network', null, null, cabin, patch)
        affectedOpenOrders = result.affectedOpenOrders
      }
      for (const change of menuDraft.changes) {
        await api.offerings.createProductOffering({
          productId: change.productId,
          scope: 'network',
          routeId: null,
          flightId: null,
          cabin: menuCabin,
          isActive: change.isActive,
          isDefault: change.isDefault,
        })
      }
      showToast(
        'success',
        `Saved ${cabinLabel(cabin)} changes.${affectedOpenOrders > 0 ? ` ${affectedOpenOrders} open orders updated.` : ''}`,
      )
      void navigate({ to: '/catering/offered-menu' })
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
            <CardDescription>
              Item changes apply to {cabinLabel(menuCabin)}
              {menuCabin === 'economy' ? ' and Premium economy' : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <RulesForm draft={draft} errors={errors} setField={setField} />
            <MenuPanel
              products={products}
              menu={menuDraft.menu}
              defaultOfferingId={menuDraft.defaultOfferingId}
              warning={warning}
              disabled={saving}
              onToggle={menuDraft.stage}
              onSetDefault={(offeringId) => {
                const off = menuDraft.menu.find((o) => o.id === offeringId)
                const productId = off ? mealProducts.find((p) => p.id === off.productId)?.id : undefined
                if (productId) menuDraft.stage(productId, true, true)
              }}
            />
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {menuDraft.changes.length > 0 && (
              <span role="status" className="text-sm text-muted-foreground">
                Unsaved menu changes
              </span>
            )}
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
