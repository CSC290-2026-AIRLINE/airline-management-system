// Offered menu page: network default card, routes table, single-flight exceptions.
// All data comes from the api layer; the network default card opens Route
// detail in Network default mode, and each route row's Edit button opens
// Route detail in Whole route mode.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { PageHeader } from '@staff-web/features/onboard-products/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useOnboardApi } from '@staff-web/features/onboard-products/api'
import type {
  Cabin,
  CabinSetting,
  FlightException,
  Product,
  ProductOffering,
  RouteFilter,
  RouteSummary,
} from '@staff-web/features/onboard-products/api/types'
import { resolveCabinSettings } from '@staff-web/features/onboard-products/offered-menu/resolve'
import { ConfirmDialog } from '@staff-web/features/onboard-products/catalog'

const PAGE_SIZE = 15

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

const ROUTE_TABLE_CABINS: Cabin[] = ['economy', 'premium_economy', 'business']

function summariseCabin(
  settings: CabinSetting[],
  offerings: ProductOffering[],
  cabin: Cabin,
): {
  service: string
  summary: string
} {
  void offerings
  const s = resolveCabinSettings(settings, cabin, null, null)
  const service =
    s.mealService.value === 'complimentary'
      ? `Complimentary · ${s.includedPerPassenger.value} included`
      : s.mealService.value === 'paid'
        ? `Paid meals · ${s.mealSelection.value === 'fixed' ? 'set meal' : 'passengers choose'}`
        : 'No meal service'
  const buffer = s.onboardBufferPercent.value > 0 ? ` · buffer ${s.onboardBufferPercent.value}%` : ''
  const selection =
    s.mealService.value === 'complimentary' ? '' : s.mealSelection.value === 'fixed' ? ' · set meal' : ` · passengers choose`
  const window = ` · order closes ${s.orderWindowHours.value} h before`
  return {
    service,
    summary: `${service}${selection}${window}${buffer}`.replace(/^.+? · /, (m) => m),
  }
}

export function OfferedMenuPage() {
  const navigate = useNavigate()
  const api = useOnboardApi()
  const [mealProducts, setMealProducts] = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [network, setNetwork] = useState<{ cabinSettings: CabinSetting[]; offerings: ProductOffering[] } | null>(null)
  const [routeRows, setRouteRows] = useState<{ total: number; totalCustomized: number; routes: RouteSummary[] } | null>(null)
  const [exceptions, setExceptions] = useState<FlightException[]>([])
  const [exceptionTotal, setExceptionTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [cabinFilter, setCabinFilter] = useState<'all' | Cabin>('all')
  const [mealFilter, setMealFilter] = useState<string>('')
  const [serviceFilter, setServiceFilter] = useState<'all' | 'complimentary' | 'paid' | 'none'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'customized' | 'inherited'>('all')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE)

  const [exceptionSearch, setExceptionSearch] = useState('')
  const [exceptionPage, setExceptionPage] = useState(0)

  const [bulkMealId, setBulkMealId] = useState<string>('')
  const [bulkCabin, setBulkCabin] = useState<Cabin>('economy')
  const [bulkConfirm, setBulkConfirm] = useState<null | { kind: 'offer' | 'withdraw' }>(null)
  const [busy, setBusy] = useState(false)
  const [clearingException, setClearingException] = useState<FlightException | null>(null)

  function showToast(kind: 'success' | 'error', message: string) {
    if (kind === 'success') toast.success(message)
    else toast.error(message)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([api.offerings.getNetworkDefault(), api.offerings.getOfferedMenu(), api.products.list()])
      .then(([net, menu, productsData]) => {
        if (cancelled) return
        setNetwork(net)
        setExceptions(menu.flightExceptions)
        setExceptionTotal(menu.flightExceptions.length)
        setAllProducts(productsData)
        setMealProducts(productsData.filter((p) => p.category === 'meal'))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the offered menu.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const filter: RouteFilter = useMemo(
    () => ({
      search,
      cabin: cabinFilter,
      mealProductId: mealFilter || null,
      mealService: serviceFilter,
      status: statusFilter,
    }),
    [search, cabinFilter, mealFilter, serviceFilter, statusFilter],
  )

  useEffect(() => {
    let cancelled = false
    api.offerings
      .listRoutes(filter)
      .then((data) => {
        if (cancelled) return
        setRouteRows(data)
        setPage(0)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load routes.')
      })
    return () => {
      cancelled = true
    }
  }, [filter, api])

  useEffect(() => {
    let cancelled = false
    api.offerings
      .listFlightExceptions({ search: exceptionSearch })
      .then((data) => {
        if (cancelled) return
        setExceptions(data.exceptions)
        setExceptionTotal(data.total)
        setExceptionPage(0)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [exceptionSearch, api])

  const visibleRoutes = useMemo(() => {
    if (!routeRows) return []
    const start = page * rowsPerPage
    return routeRows.routes.slice(start, start + rowsPerPage)
  }, [routeRows, page, rowsPerPage])

  const totalPages = useMemo(() => {
    if (!routeRows) return 0
    return Math.max(1, Math.ceil(routeRows.routes.length / rowsPerPage))
  }, [routeRows, rowsPerPage])

  const exceptionPages = Math.max(1, Math.ceil(exceptions.length / 10))
  const visibleExceptions = exceptions.slice(exceptionPage * 10, exceptionPage * 10 + 10)

  function clearFilters() {
    setSearch('')
    setCabinFilter('all')
    setMealFilter('')
    setServiceFilter('all')
    setStatusFilter('all')
  }

  async function refreshRoutes() {
    const data = await api.offerings.listRoutes(filter)
    setRouteRows(data)
  }

  async function handleBulk(kind: 'offer' | 'withdraw') {
    if (!bulkMealId) {
      showToast('error', 'Pick a meal to offer or withdraw.')
      return
    }
    setBusy(true)
    try {
      const result =
        kind === 'offer'
          ? await api.offerings.bulkOffer(filter, bulkMealId, bulkCabin)
          : await api.offerings.bulkWithdraw(filter, bulkMealId, bulkCabin)
      const meal = allProducts.find((p) => p.id === bulkMealId)
      const skip = result.skippedRoutes > 0 ? `, ${result.skippedRoutes} skipped` : ''
      if (kind === 'offer') {
        showToast('success', `Offered ${meal?.name ?? 'meal'} on ${result.affectedRoutes} routes (${cabinLabel(bulkCabin)})${skip}.`)
      } else {
        showToast('success', `Withdrew ${meal?.name ?? 'meal'} from ${result.affectedRoutes} routes (${cabinLabel(bulkCabin)})${skip}.`)
      }
      setBulkConfirm(null)
      await refreshRoutes()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Bulk action failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleClearException() {
    if (!clearingException) return
    setBusy(true)
    try {
      await api.offerings.clearFlightException(clearingException.id)
      showToast('success', `Cleared ${clearingException.flightNumber} exception.`)
      setClearingException(null)
      const data = await api.offerings.listFlightExceptions({ search: exceptionSearch })
      setExceptions(data.exceptions)
      setExceptionTotal(data.total)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not clear the exception.')
    } finally {
      setBusy(false)
    }
  }

  const summary = routeRows == null ? '…' : `${routeRows.routes.length} routes shown · ${routeRows.totalCustomized} customized`

  if (loading && !network) {
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Offered menu"
        description="Everything each route offers in each cabin: the meals on the menu and the rules for how meals and extras work. Open a route to edit both."
      />

      {network && (
        <Card className="gap-4" aria-label="Network default">
          <CardHeader>
            <CardTitle>Network default</CardTitle>
            <CardDescription>
              The starting rules for all {routeRows?.total ?? ''} routes in the network. A route or a single flight can override them.
            </CardDescription>
            <CardAction>
              <Button type="button" variant="outline" onClick={() => navigate({ to: '/catering/offered-menu/network' })}>
                Edit network default
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {CABINS.map((cabin) => {
              const summary = summariseCabin(network.cabinSettings, network.offerings, cabin)
              return (
                <div key={cabin} className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-4">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{cabin.replace('_', ' ')}</span>
                  <span className="text-sm font-medium">{summary.service}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card className="gap-4" aria-label="Routes">
        <CardHeader>
          <CardTitle>Routes</CardTitle>
          <CardDescription>
            Meal rules and menu per cabin. A route inherits the network rules and standard menu until you customize it.
          </CardDescription>
          <CardAction className="text-sm text-muted-foreground">{summary}</CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterField label="Search route">
              <Input type="search" placeholder="Search route" value={search} onChange={(e) => setSearch(e.target.value)} />
            </FilterField>
            <FilterField label="Cabin">
              <NativeSelect className="w-full" value={cabinFilter} onChange={(e) => setCabinFilter(e.target.value as 'all' | Cabin)}>
                <NativeSelectOption value="all">All cabins</NativeSelectOption>
                <NativeSelectOption value="economy">Economy</NativeSelectOption>
                <NativeSelectOption value="premium_economy">Premium economy</NativeSelectOption>
                <NativeSelectOption value="business">Business</NativeSelectOption>
              </NativeSelect>
            </FilterField>
            <FilterField label="Offers meal">
              <NativeSelect className="w-full" value={mealFilter} onChange={(e) => setMealFilter(e.target.value)}>
                <NativeSelectOption value="">Any meal</NativeSelectOption>
                {mealProducts.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FilterField>
            <FilterField label="Meal service">
              <NativeSelect
                className="w-full"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value as typeof serviceFilter)}
              >
                <NativeSelectOption value="all">Any</NativeSelectOption>
                <NativeSelectOption value="complimentary">Complimentary</NativeSelectOption>
                <NativeSelectOption value="paid">Paid</NativeSelectOption>
                <NativeSelectOption value="none">None</NativeSelectOption>
              </NativeSelect>
            </FilterField>
            <FilterField label="Show">
              <NativeSelect
                className="w-full"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <NativeSelectOption value="all">All</NativeSelectOption>
                <NativeSelectOption value="customized">Customized</NativeSelectOption>
                <NativeSelectOption value="inherited">Inherited</NativeSelectOption>
              </NativeSelect>
            </FilterField>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="link" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4">
            <div>
              <p className="m-0 text-sm font-semibold">Bulk edit</p>
              <p className="m-0 text-sm text-muted-foreground">
                Applies to all {routeRows?.routes.length ?? 0} matching routes, not only this page.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <NativeSelect className="w-full sm:w-56" value={bulkMealId} onChange={(e) => setBulkMealId(e.target.value)}>
                <NativeSelectOption value="">Pick a meal</NativeSelectOption>
                {mealProducts.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect className="w-full sm:w-44" value={bulkCabin} onChange={(e) => setBulkCabin(e.target.value as Cabin)}>
                <NativeSelectOption value="economy">Economy</NativeSelectOption>
                <NativeSelectOption value="premium_economy">Premium economy</NativeSelectOption>
                <NativeSelectOption value="business">Business</NativeSelectOption>
              </NativeSelect>
              <Button type="button" disabled={busy || !bulkMealId} onClick={() => setBulkConfirm({ kind: 'offer' })}>
                {busy ? 'Working…' : `Offer on ${routeRows?.routes.length ?? 0} routes`}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || !bulkMealId}
                onClick={() => setBulkConfirm({ kind: 'withdraw' })}
              >
                Withdraw from {routeRows?.routes.length ?? 0} routes
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                {ROUTE_TABLE_CABINS.map((c) => (
                  <TableHead key={c}>{cabinLabel(c)}</TableHead>
                ))}
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRoutes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      to="/catering/offered-menu/$routeId"
                      params={{ routeId: r.id }}
                      search={{ flight: null }}
                      className="flex flex-col no-underline"
                    >
                      <span className="font-medium text-foreground">
                        {r.originAirport} → {r.destinationAirport}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.originCity} to {r.destinationCity}
                      </span>
                    </Link>
                  </TableCell>
                  {ROUTE_TABLE_CABINS.map((c) => {
                    const status = r.cabinStatuses[c]
                    if (!status) {
                      return <TableCell key={c}>—</TableCell>
                    }
                    return (
                      <TableCell key={c}>
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {capitalize(status.mealService)}
                          {status.state === 'custom' && <Badge variant="secondary">Custom</Badge>}
                        </span>
                      </TableCell>
                    )
                  })}
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/catering/offered-menu/$routeId" params={{ routeId: r.id }} search={{ flight: null }}>
                        Edit
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="m-0 text-muted-foreground">
              Showing {visibleRoutes.length === 0 ? 0 : page * rowsPerPage + 1}–{page * rowsPerPage + visibleRoutes.length} of{' '}
              {routeRows?.routes.length ?? 0} routes
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Rows</span>
              <NativeSelect
                className="w-20"
                aria-label="Rows per page"
                value={String(rowsPerPage)}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value))
                  setPage(0)
                }}
              >
                <NativeSelectOption value="15">15</NativeSelectOption>
                <NativeSelectOption value="25">25</NativeSelectOption>
                <NativeSelectOption value="50">50</NativeSelectOption>
              </NativeSelect>
              <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button type="button" variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4" aria-label="Single-flight exceptions">
        <CardHeader>
          <CardTitle>Single-flight exceptions</CardTitle>
          <CardDescription>Flights that override their route&rsquo;s rules. To add one, open the route and pick a flight.</CardDescription>
          <CardAction className="text-sm text-muted-foreground">{exceptionTotal} flights</CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="max-w-sm">
            <FilterField label="Search flight">
              <Input
                type="search"
                placeholder="Search flight"
                value={exceptionSearch}
                onChange={(e) => setExceptionSearch(e.target.value)}
              />
            </FilterField>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flight</TableHead>
                <TableHead>Cabin</TableHead>
                <TableHead>Settings changed</TableHead>
                <TableHead className="w-32">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleExceptions.map((e) => (
                <TableRow key={`${e.id}-${e.cabin}`}>
                  <TableCell>
                    <span className="flex flex-col">
                      <span className="font-medium">{e.flightNumber}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.route || '—'} · {formatDate(e.scheduledDeparture)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>{cabinLabel(e.cabin)}</TableCell>
                  <TableCell>{e.changedSettings.join(', ')}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/catering/offered-menu/$routeId" params={{ routeId: e.routeId }} search={{ flight: e.id }}>
                          Edit
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setClearingException(e)}
                      >
                        Clear
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="m-0 text-muted-foreground">
              {visibleExceptions.length} of {exceptions.length} shown
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exceptionPage === 0}
                onClick={() => setExceptionPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {exceptionPage + 1} of {exceptionPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exceptionPage + 1 >= exceptionPages}
                onClick={() => setExceptionPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {bulkConfirm && routeRows && (
        <ConfirmDialog
          title={
            bulkConfirm.kind === 'offer'
              ? `Offer this meal on ${routeRows.routes.length} routes?`
              : `Withdraw this meal from ${routeRows.routes.length} routes?`
          }
          body={
            bulkConfirm.kind === 'offer'
              ? `This adds ${
                  allProducts.find((p) => p.id === bulkMealId)?.name ?? 'the meal'
                } to the ${cabinLabel(bulkCabin)} menu of every route matching the current filters (${routeRows.routes.length} routes), not only the current page. Routes with a custom menu are included.`
              : `This removes ${
                  allProducts.find((p) => p.id === bulkMealId)?.name ?? 'the meal'
                } from the ${cabinLabel(bulkCabin)} menu of every route matching the current filters (${routeRows.routes.length} routes).`
          }
          confirmLabel={bulkConfirm.kind === 'offer' ? 'Offer' : 'Withdraw'}
          busy={busy}
          onClose={() => setBulkConfirm(null)}
          onConfirm={() => void handleBulk(bulkConfirm.kind)}
        />
      )}

      {clearingException && (
        <ConfirmDialog
          title={`Clear ${clearingException.flightNumber}?`}
          body="This removes the flight's overrides, so the route's rules apply again. Existing orders keep their settings."
          confirmLabel="Clear"
          busy={busy}
          onClose={() => setClearingException(null)}
          onConfirm={() => void handleClearException()}
        />
      )}
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function cabinLabel(cabin: Cabin): string {
  if (cabin === 'economy') return 'Economy'
  if (cabin === 'premium_economy') return 'Premium economy'
  return 'Business'
}

function capitalize(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}
