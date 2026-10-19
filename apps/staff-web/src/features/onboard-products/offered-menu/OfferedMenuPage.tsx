// Offered menu page: network default card, routes table, single-flight exceptions.
// All data comes from the api layer; the network default card opens Route
// detail in Network default mode, and each route row's Edit button opens
// Route detail in Whole route mode.

import { useEffect, useMemo, useState } from 'react'
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
import { ConfirmDialog } from '@staff-web/features/onboard-products/offered-menu/ConfirmDialog'
import { Toast, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import styles from './OfferedMenuPage.module.css'

const PAGE_SIZE = 15

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']

const ROUTE_TABLE_CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']

function nextToastId(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

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

  const [toast, setToast] = useState<ToastData | null>(null)

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: nextToastId(), kind, message })
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
    return <p className={styles.message}>Loading offered menu…</p>
  }
  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Offered menu</h1>
          <p className={styles.subtitle}>
            Everything each route offers in each cabin: the meals on the menu and the rules for how meals and extras work. Open a route to
            edit both.
          </p>
        </div>
      </header>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      {network && (
        <section className={styles.card} aria-label="Network default">
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Network default</h2>
              <p className={styles.cardSubtitle}>
                The starting rules for all {routeRows?.total ?? ''} routes in the network. A route or a single flight can override them.
              </p>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={() => navigate({ to: '/catering/offered-menu/network' })}>
              Edit network default
            </button>
          </div>
          <div className={styles.networkTiles}>
            {CABINS.map((cabin) => {
              const summary = summariseCabin(network.cabinSettings, network.offerings, cabin)
              return (
                <div key={cabin} className={styles.networkTile}>
                  <p className={styles.tileLabel}>{cabin.replace('_', ' ')}</p>
                  <p className={styles.tileBody}>{summary.service}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className={styles.card} aria-label="Routes">
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Routes</h2>
            <p className={styles.cardSubtitle}>
              Meal rules and menu per cabin. A route inherits the network rules and standard menu until you customize it.
            </p>
          </div>
          <p className={styles.count}>{summary}</p>
        </div>

        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Search route</span>
            <input
              type="search"
              className={styles.filterInput}
              placeholder="Search route"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Cabin</span>
            <select className={styles.filterInput} value={cabinFilter} onChange={(e) => setCabinFilter(e.target.value as 'all' | Cabin)}>
              <option value="all">All cabins</option>
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium economy</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Offers meal</span>
            <select className={styles.filterInput} value={mealFilter} onChange={(e) => setMealFilter(e.target.value)}>
              <option value="">Any meal</option>
              {mealProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Meal service</span>
            <select
              className={styles.filterInput}
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value as typeof serviceFilter)}
            >
              <option value="all">Any</option>
              <option value="complimentary">Complimentary</option>
              <option value="paid">Paid</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Show</span>
            <select
              className={styles.filterInput}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All</option>
              <option value="customized">Customized</option>
              <option value="inherited">Inherited</option>
            </select>
          </label>
        </div>
        <button type="button" className={styles.clearLink} onClick={clearFilters}>
          Clear filters
        </button>

        <div className={styles.bulkBar}>
          <div>
            <p className={styles.bulkTitle}>Bulk edit</p>
            <p className={styles.bulkSubtitle}>Applies to all {routeRows?.routes.length ?? 0} matching routes, not only this page.</p>
          </div>
          <div className={styles.bulkControls}>
            <select className={styles.filterInput} value={bulkMealId} onChange={(e) => setBulkMealId(e.target.value)}>
              <option value="">Pick a meal</option>
              {mealProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select className={styles.filterInput} value={bulkCabin} onChange={(e) => setBulkCabin(e.target.value as Cabin)}>
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium economy</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </select>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy || !bulkMealId}
              onClick={() => setBulkConfirm({ kind: 'offer' })}
            >
              {busy ? 'Working…' : `Offer on ${routeRows?.routes.length ?? 0} routes`}
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy || !bulkMealId}
              onClick={() => setBulkConfirm({ kind: 'withdraw' })}
            >
              Withdraw from {routeRows?.routes.length ?? 0} routes
            </button>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Route</th>
                {ROUTE_TABLE_CABINS.map((c) => (
                  <th scope="col" key={c}>
                    {cabinLabel(c)}
                  </th>
                ))}
                <th scope="col" className={styles.thActions}>
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRoutes.map((r) => (
                <tr key={r.id} className={styles.row}>
                  <td>
                    <Link
                      to="/catering/offered-menu/$routeId"
                      params={{ routeId: r.id }}
                      search={{ flight: null }}
                      className={styles.routeLink}
                    >
                      <span className={styles.routeCode}>
                        {r.originAirport} → {r.destinationAirport}
                      </span>
                      <span className={styles.routeSub}>
                        {r.originCity} to {r.destinationCity}
                      </span>
                    </Link>
                  </td>
                  {ROUTE_TABLE_CABINS.map((c) => {
                    const status = r.cabinStatuses[c]
                    if (!status) {
                      return (
                        <td key={c}>
                          <span className={styles.cabinName}>—</span>
                        </td>
                      )
                    }
                    return (
                      <td key={c}>
                        <span className={styles.cabinName}>{capitalize(status.mealService)}</span>
                        {status.state === 'custom' && <span className={styles.customBadge}>Custom</span>}
                      </td>
                    )
                  })}
                  <td className={styles.tdActions}>
                    <Link
                      to="/catering/offered-menu/$routeId"
                      params={{ routeId: r.id }}
                      search={{ flight: null }}
                      className={styles.editButton}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.paging}>
          <p className={styles.pagingInfo}>
            Showing {visibleRoutes.length === 0 ? 0 : page * rowsPerPage + 1}–{page * rowsPerPage + visibleRoutes.length} of{' '}
            {routeRows?.routes.length ?? 0} routes
          </p>
          <div className={styles.pagingControls}>
            <label className={styles.rowsLabel}>
              <span className={styles.filterLabel}>Rows</span>
              <select
                className={styles.filterInput}
                value={String(rowsPerPage)}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value))
                  setPage(0)
                }}
              >
                <option value="15">15</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
            <button type="button" className={styles.pageButton} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </button>
            <span className={styles.pageOf}>
              Page {page + 1} of {totalPages}
            </span>
            <button type="button" className={styles.pageButton} disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="Single-flight exceptions">
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Single-flight exceptions</h2>
            <p className={styles.cardSubtitle}>
              Flights that override their route&rsquo;s rules. To add one, open the route and pick a flight.
            </p>
          </div>
        </div>
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Search flight</span>
            <input
              type="search"
              className={styles.filterInput}
              placeholder="Search flight"
              value={exceptionSearch}
              onChange={(e) => setExceptionSearch(e.target.value)}
            />
          </label>
          <p className={styles.count}>{exceptionTotal} flights</p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Flight</th>
                <th scope="col">Cabin</th>
                <th scope="col">Settings changed</th>
                <th scope="col" className={styles.thActions}>
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleExceptions.map((e) => (
                <tr key={e.id} className={styles.row}>
                  <td>
                    <span className={styles.flightCode}>{e.flightNumber}</span>
                    <span className={styles.routeSub}>
                      {e.routeId ? e.routeId.replace('r-', '').toUpperCase() : '—'} · {formatDate(e.scheduledDeparture)}
                    </span>
                  </td>
                  <td className={styles.cabinName}>{cabinLabel(e.cabin)}</td>
                  <td>{e.changedSettings.join(', ')}</td>
                  <td className={styles.tdActions}>
                    <Link
                      to="/catering/offered-menu/$routeId"
                      params={{ routeId: e.routeId }}
                      search={{ flight: e.id }}
                      className={styles.editButton}
                    >
                      Edit
                    </Link>
                    <button type="button" className={styles.dangerLink} onClick={() => setClearingException(e)}>
                      Clear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.paging}>
          <p className={styles.pagingInfo}>
            {visibleExceptions.length} of {exceptions.length} shown
          </p>
          <div className={styles.pagingControls}>
            <button
              type="button"
              className={styles.pageButton}
              disabled={exceptionPage === 0}
              onClick={() => setExceptionPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className={styles.pageOf}>
              Page {exceptionPage + 1} of {exceptionPages}
            </span>
            <button
              type="button"
              className={styles.pageButton}
              disabled={exceptionPage + 1 >= exceptionPages}
              onClick={() => setExceptionPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

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

function cabinLabel(cabin: Cabin): string {
  if (cabin === 'economy') return 'Economy'
  if (cabin === 'premium_economy') return 'Premium economy'
  if (cabin === 'business') return 'Business'
  return 'First'
}

function capitalize(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}
