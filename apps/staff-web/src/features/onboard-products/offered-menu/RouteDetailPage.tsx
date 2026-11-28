// Route detail: edit a single route's menu and cabin rules. Three modes:
// Whole route (default), Single flight, or Network default. The layout
// mirrors the prototype: three cabin tiles at the top, a "rules and menu"
// panel below, with the settings on the left and the menu on the right.
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import type { RouteFlight } from '@staff-web/features/onboard-products/api/mappers'
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
import { resolveCabinSettings, resolveMenu } from '@staff-web/features/onboard-products/offered-menu/resolve'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { PageHeader } from '@staff-web/features/onboard-products/ui'
import { CabinTile, MenuPanel, RulesForm } from './parts'
import { useMenuDraft } from './useMenuDraft'

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

type Mode = 'route' | 'flight' | 'network'

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
  const [networkFlights, setNetworkFlights] = useState<RouteFlight[]>([])
  const [allExceptions, setAllExceptions] = useState<FlightException[]>([])
  const [allRoutes, setAllRoutes] = useState<RouteSummary[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const mealProducts = products.filter((product) => product.category === 'meal')
  // Initial mode follows the URL: ?flight=... preselects Single flight mode.
  const [mode, setMode] = useState<Mode>(search.flight ? 'flight' : 'route')
  const [flightId, setFlightId] = useState<string | null>(null)
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
    setLoading(true)
    setError(null)
    Promise.all([api.offerings.getRouteDetail(routeId), api.products.list()])
      .then(([d, products]) => {
        if (cancelled) return
        setDetail(d)
        setProducts(products.filter((product) => product.isActive))
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

  useEffect(() => {
    if (mode !== 'flight') return
    let active = true
    const load = () => {
      void api.offerings
        .listNetworkFlights()
        .then((flights) => {
          if (active) setNetworkFlights(flights)
        })
        .catch(() => {
          // The route detail still supplies its own flights.
        })
    }
    load()
    window.addEventListener('focus', load)
    return () => {
      active = false
      window.removeEventListener('focus', load)
    }
  }, [api, mode])

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
    return resolveMenu(detail.offerings, cabin, mode === 'network' ? null : routeId, mode === 'flight' ? flightId : null)
  }, [detail, cabin, mode, routeId, flightId])
  const menuCabin = cabin === 'premium_economy' ? 'economy' : cabin
  const menuDraft = useMenuDraft(`${mode}:${routeId}:${mode === 'flight' ? flightId : ''}:${menuCabin}`, effectiveMenu.menu, mealProducts)

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
    const resolved = resolveCabinSettings(
      detail?.cabinSettings ?? [],
      cabin,
      mode === 'network' ? null : routeId,
      mode === 'flight' ? flightId : null,
    )
    d.snacksService = !resolved.snacksEnabled.value ? 'none' : resolved.snacksComplimentary.value ? 'complimentary' : 'paid'
    d.dutyFreeEnabled = resolved.dutyFreeEnabled.value
    setDraft(d)
    setOriginal(d)
    setErrors({})
  }, [activeRow, cabin, detail?.cabinSettings, mode, routeId, flightId])

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

  if (loading || (!error && detail?.route && detail.route.id !== routeId)) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (!detail) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>Route not found.</AlertDescription>
      </Alert>
    )
  }

  const route = detail.route
  const flights = detail.flights
  const isNetwork = mode === 'network'
  const isFlight = mode === 'flight'

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  const flightOptionsById = new Map([...flights, ...networkFlights].map((flight) => [flight.id, flight]))
  const flightPickerOptions = [...flightOptionsById.values()].sort((a, b) => {
    const onRoute = Number(b.routeId === routeId) - Number(a.routeId === routeId)
    return onRoute || a.scheduledDeparture.localeCompare(b.scheduledDeparture)
  })

  function selectFlight(nextFlightId: string) {
    const selected = flightOptionsById.get(nextFlightId)
    if (!selected) return
    if (selected.routeId !== routeId || !flights.some((flight) => flight.id === selected.id)) {
      void navigate({ to: '/catering/offered-menu/$routeId', params: { routeId: selected.routeId }, search: { flight: nextFlightId } })
      return
    }
    setFlightId(nextFlightId)
  }

  async function handleSave() {
    if (!draft || !original || saving || (mode === 'flight' && !flightId)) return
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
        const result = await api.offerings.putCabinSettings(
          mode,
          mode === 'route' ? routeId : null,
          mode === 'flight' ? flightId : null,
          cabin,
          patch,
        )
        affectedOpenOrders = result.affectedOpenOrders
      }
      for (const change of menuDraft.changes) {
        const offering = {
          productId: change.productId,
          scope: mode,
          routeId: mode === 'route' ? routeId : null,
          flightId: mode === 'flight' ? flightId : null,
          copyInheritedMenu: true,
          cabin: menuCabin,
          isActive: change.isActive,
          isDefault: change.isDefault,
        }
        if (mode === 'route' && change.availabilityChanged) {
          await api.offerings.createProductOffering({ ...offering, allRouteCabins: true, isDefault: false })
          if (!change.makeDefault) continue
        }
        await api.offerings.createProductOffering(offering)
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

  // Helper: is the value at the current level or inherited?
  // The summary text below each cabin tile: "5 meals · default Green curry chicken".
  // The menu also holds snacks, drinks and duty-free; the tiles and the menu panel count meals only.
  const mealsIn = (menu: ProductOffering[]) => menu.filter((o) => o.isActive && mealProducts.some((p) => p.id === o.productId)).length

  function cabinTileSubline(c: Cabin): string {
    if (!detail) return ''
    const m = resolveMenu(detail.offerings, c, mode === 'network' ? null : routeId, mode === 'flight' ? flightId : null)
    if (mealsIn(m.menu) === 0) return '0 meals · no menu set'
    const def = m.menu.find((o) => o.id === m.defaultOfferingId)
    const defName = def ? mealProducts.find((p) => p.id === def.productId)?.name : null
    return defName ? `${mealsIn(m.menu)} meals · default ${defName}` : `${mealsIn(m.menu)} meals · standard menu`
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground">
          <Link to="/catering/offered-menu">
            <ArrowLeft aria-hidden="true" />
            Back to offered menu
          </Link>
        </Button>
        <PageHeader
          title={headerRoute ? `${headerRoute.originAirport} → ${headerRoute.destinationAirport}` : 'Network default'}
          description={
            isNetwork
              ? 'Starting rules that apply to every route until a route or single flight overrides them.'
              : isFlight
                ? flightId
                  ? (() => {
                      const f = allExceptions.find((e) => e.id === flightId) ?? flights.find((x) => x.id === flightId)
                      return f ? `${f.flightNumber} · ${formatDate(f.scheduledDeparture)}` : ''
                    })()
                  : 'Pick a flight to edit its overrides.'
                : headerRoute
                  ? `${headerRoute.originCity} to ${headerRoute.destinationCity}`
                  : undefined
          }
          actions={
            <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
              <TabsList aria-label="Mode">
                <TabsTrigger value="route" disabled={route == null}>
                  Whole route
                </TabsTrigger>
                <TabsTrigger value="flight">Single flight</TabsTrigger>
                <TabsTrigger value="network">Network default</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
      </div>

      {isFlight && flightPickerOptions.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <div className="flex w-full max-w-md flex-col gap-2">
            <Label htmlFor="flight-picker">Flight</Label>
            <NativeSelect id="flight-picker" className="w-full" value={flightId ?? ''} onChange={(e) => selectFlight(e.target.value)}>
              {!flightId && (
                <NativeSelectOption value="" disabled>
                  Select a flight
                </NativeSelectOption>
              )}
              {flightPickerOptions.map((f) => (
                <NativeSelectOption key={f.id} value={f.id}>
                  {f.flightNumber} · {formatDate(f.scheduledDeparture)} · {routeCodeFromId(f.routeId)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {flightId && (
            <span className="pb-2 text-sm text-muted-foreground">
              {(() => {
                const exception = allExceptions.find((row) => row.id === flightId && row.cabin === cabin)
                const labels = exception?.changedSettings.map(humaniseField).filter(Boolean) ?? []
                return labels.length > 0 ? `Overrides: ${labels.join(', ')}` : 'Standard flight'
              })()}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {CABINS.map((c) => {
          const s = activeCabinSetting(detail, c, mode, routeId, flightId)
          const summary = cabinSummary(s)
          const custom = isCustom(c)
          return (
            <CabinTile
              key={c}
              name={cabinLabel(c)}
              badge={isNetwork ? 'Default' : custom ? 'Custom' : 'Inherited'}
              badgeTone={custom && !isNetwork ? 'secondary' : 'outline'}
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
              {mode === 'route'
                ? 'Offering or withdrawing an item applies to all cabins on this route. Cabin rules and the default meal are set per menu.'
                : `Item changes apply to ${cabinLabel(menuCabin)}${menuCabin === 'economy' ? ' and Premium economy' : ''}.`}
            </CardDescription>
            {!isNetwork && (
              <CardAction>
                <Button type="button" variant="outline" onClick={() => void handleResetInherited()} disabled={saving || !activeRow}>
                  Reset to inherited
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <RulesForm draft={draft} errors={errors} setField={setField} />
            <MenuPanel
              products={products}
              menu={menuDraft.menu}
              defaultOfferingId={menuDraft.defaultOfferingId}
              warning={warning}
              disabled={saving || (mode === 'flight' && !flightId)}
              onToggle={menuDraft.stage}
              onSetDefault={(offeringId) => {
                const productId = mealProducts.find((p) => p.id === menuDraft.menu.find((o) => o.id === offeringId)?.productId)?.id
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
              {!isNetwork &&
                (isCustom(cabin) ? 'Custom for this ' + mode : `Inherited from ${mode === 'flight' ? 'this flight' : 'network'}`)}
            </span>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate({ to: '/catering/offered-menu' })} disabled={saving}>
                Cancel
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
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
