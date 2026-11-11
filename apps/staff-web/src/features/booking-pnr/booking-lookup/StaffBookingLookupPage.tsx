import { Component, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { useBookingPnrApi } from '../api/client'
import type { StaffBookingPage, StaffBookingQuery } from '../api/types'
import {
  lookupDate,
  lookupDateRange,
  lookupFiltersFromSearch,
  lookupMoney,
  lookupQuery,
  lookupQueryFromSearch,
  lookupSearchFromFilters,
  lookupShortDate,
  type LookupFilters,
  type LookupPeriod,
  type LookupSearch,
} from './lookup-utils'
import { BookingDetailsDialog } from './BookingDetailsDialog'
import './lookup.css'

/** Radix `Select` items cannot have an empty value, so the "no status filter" row gets its own marker. */
const ALL_STATUSES = '__all__'

class LookupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <main className="f3-lookup">
        <h1>Booking lookup is unavailable</h1>
        <p>Refresh the page to try again.</p>
        <Button onClick={() => window.location.reload()}>Refresh page</Button>
      </main>
    ) : (
      this.props.children
    )
  }
}
export function StaffBookingLookupPage() {
  return (
    <LookupBoundary>
      <LookupContent />
    </LookupBoundary>
  )
}

/**
 * The query for the current URL. A custom range that is not filled in yet falls back to the default period, so the
 * list still loads; the page shows the message from `lookupFormError` above it.
 */
function safeLookupQuery(search: LookupSearch): StaffBookingQuery {
  try {
    return lookupQueryFromSearch(search)
  } catch {
    return lookupQuery(lookupFiltersFromSearch({ ...search, period: 'week' }), search.page ?? 1, search.pageSize ?? 20)
  }
}
function lookupFormError(search: LookupSearch): string | null {
  try {
    lookupQueryFromSearch(search)
    return null
  } catch (cause) {
    return cause instanceof Error ? cause.message : 'Check your filter values.'
  }
}
/**
 * Says what the URL is showing. The booking reference is left out on purpose: opening a booking changes the URL, but
 * not the list behind it.
 */
function lookupKey(search: LookupSearch) {
  const filters = lookupFiltersFromSearch(search)
  return JSON.stringify([
    filters.search,
    filters.dateType,
    filters.period,
    filters.from,
    filters.to,
    filters.status,
    search.page ?? 1,
    search.pageSize ?? 20,
  ])
}

function LookupContent() {
  const search = useSearch({ from: '/_authenticated/booking-lookup' })
  const { reference } = search
  const navigate = useNavigate({ from: '/booking-lookup' })
  const currentApi = useBookingPnrApi(),
    api = useRef(currentApi)
  /* The filters are the URL: a refresh, a shared link and the back button all show the same list. */
  const filters = useMemo(() => lookupFiltersFromSearch(search), [search])
  /* The search box keeps its own text until it is submitted, so a half-typed reference is not sent to the API. */
  const [draftSearch, setDraftSearch] = useState(() => search.q ?? '')
  const urlKey = lookupKey(search)
  const [applied, setApplied] = useState<{ key: string; q: string }>(() => ({ key: urlKey, q: search.q ?? '' }))
  const [query, setQuery] = useState<StaffBookingQuery>(() => safeLookupQuery(search))
  const [page, setPage] = useState<StaffBookingPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(() => lookupFormError(search))
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    api.current = currentApi
  }, [currentApi])
  /* Render-time adjustment — the URL is the prop here. When it changes (a filter the user picked, the back button, a
     shared link), the query and the messages are re-seeded from it. */
  if (applied.key !== urlKey) {
    const previousSearch = applied.q
    setApplied({ key: urlKey, q: search.q ?? '' })
    setQuery(safeLookupQuery(search))
    setFormError(lookupFormError(search))
    setError(null)
    setLoading(true)
    if (previousSearch !== (search.q ?? '')) setDraftSearch(search.q ?? '')
  }
  useEffect(() => {
    let active = true
    void api.current
      .searchBookings(query)
      .then((value) => {
        if (active) setPage(value)
      })
      .catch((cause: unknown) => {
        if (active) {
          setPage(null)
          setError(cause instanceof Error ? cause.message : 'We could not load bookings.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [query, refresh])

  /**
   * Runs the current filters. Every filter control calls this on change, so the list narrows as the agent works
   * rather than after a submit. The search box applies on Enter through the form below, because a free-text query
   * would otherwise refetch on every keystroke.
   */
  function apply(next: LookupFilters, pageNumber = 1, pageSize = query.pageSize ?? 20) {
    try {
      lookupQuery(next, pageNumber, pageSize)
      setError(null)
      setNotice(null)
      void navigate({
        to: '/booking-lookup',
        search: { ...lookupSearchFromFilters(next, pageNumber, pageSize), reference: search.reference },
        replace: true,
      })
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Check your filter values.')
    }
  }
  /** One filter control changed: keep the other values and re-run the query. */
  function changeFilter<K extends keyof LookupFilters>(key: K, value: LookupFilters[K]) {
    apply({ ...filters, [key]: value })
  }
  /**
   * Periods map to concrete dates, so switching straight to a custom range would leave From/To empty and fail
   * validation (frame 01d shows a filled range). Seed it from the period the agent just left, then apply.
   */
  function changePeriod(period: LookupPeriod) {
    const next = { ...filters, period }
    if (period === 'custom' && (!next.from || !next.to)) {
      const range = lookupDateRange(filters.period)
      const today = new Date().toISOString().slice(0, 10)
      next.from = range.from ?? today
      next.to = range.to ?? today
    }
    apply(next)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    apply({ ...filters, search: draftSearch })
  }
  function reload() {
    setLoading(true)
    setError(null)
    setRefresh((value) => value + 1)
  }
  function changePage(value: number) {
    setError(null)
    void navigate({ to: '/booking-lookup', search: { ...search, page: value > 1 ? value : undefined }, replace: true })
  }
  function changePageSize(value: number) {
    setError(null)
    void navigate({
      to: '/booking-lookup',
      search: { ...search, page: undefined, pageSize: value === 20 ? undefined : value },
      replace: true,
    })
  }
  const start = page?.items.length ? (page.page - 1) * page.pageSize + 1 : 0
  const end = page?.items.length ? start + page.items.length - 1 : 0
  const range = `${query.dateType === 'travelling' ? 'Travelling' : 'Booked'} ${
    query.from ? lookupDate(query.from) : 'any date'
  }${query.to ? ` to ${lookupDate(query.to)}` : ''}`
  return (
    <main className="f3-lookup">
      <header className="f3-lookup-heading">
        <h1>Bookings</h1>
      </header>
      <p className="f3-lookup-muted">
        All bookings, newest first. Filter by date or status, or search by reference, name, ticket number or passport.
      </p>
      <form className="f3-lookup-card f3-lookup-filters" onSubmit={submit} aria-label="Booking search and filters">
        <div className={`f3-lookup-filter-row${filters.period === 'custom' ? ' is-custom' : ''}`}>
          <label className="f3-lookup-search">
            Search
            <Input
              maxLength={200}
              placeholder="Reference, passenger name, ticket number or passport"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
            />
          </label>
          <label>
            Date type
            <Select value={filters.dateType} onValueChange={(value) => changeFilter('dateType', value as LookupFilters['dateType'])}>
              <SelectTrigger className="min-h-10.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="booked">Booked on</SelectItem>
                <SelectItem value="travelling">Travelling on</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            Period
            <Select value={filters.period} onValueChange={(value) => changePeriod(value as LookupPeriod)}>
              <SelectTrigger className="min-h-10.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="year">This year</SelectItem>
                <SelectItem value="last_year">Last year</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {filters.period === 'custom' && (
            <>
              <label>
                From
                <Input
                  type="date"
                  max={filters.to || undefined}
                  value={filters.from}
                  onChange={(event) => changeFilter('from', event.target.value)}
                />
              </label>
              <label>
                To
                <Input
                  type="date"
                  min={filters.from || undefined}
                  value={filters.to}
                  onChange={(event) => changeFilter('to', event.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Status
            <Select
              value={filters.status || ALL_STATUSES}
              onValueChange={(value) => changeFilter('status', (value === ALL_STATUSES ? '' : value) as LookupFilters['status'])}
            >
              <SelectTrigger className="min-h-10.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES}>All</SelectItem>
                <SelectItem value="held">Held</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        {formError && (
          <p role="alert" className="f3-lookup-error">
            {formError}
          </p>
        )}
      </form>
      {notice && (
        <p className="f3-lookup-success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="f3-lookup-error" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={reload}>
            Try again
          </Button>
        </div>
      )}
      <section className="f3-lookup-card" aria-label="Booking results" aria-busy={loading}>
        <div className="f3-lookup-results-heading">
          <p aria-live="polite">{loading ? 'Loading bookings…' : `${page?.total ?? 0} bookings`}</p>
          <span>{query.search ? `Search: “${query.search}”` : range} · newest first</span>
        </div>
        {!loading && page?.items.length === 0 && (
          <div className="f3-lookup-empty">
            <h2>No bookings found</h2>
            <p>Try another search or adjust the filters.</p>
          </div>
        )}
        {!loading && !!page?.items.length && (
          <div className="f3-lookup-table-wrap">
            <table>
              <caption className="f3-lookup-sr">Staff bookings. Select a reference to open booking details.</caption>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Lead passenger</th>
                  <th>Trip</th>
                  <th>Booked</th>
                  <th>Status</th>
                  <th>Assistance</th>
                  <th className="f3-lookup-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((item) => (
                  <tr key={item.bookingId}>
                    <td>
                      <button
                        className="f3-lookup-reference"
                        onClick={() => void navigate({ to: '/booking-lookup', search: { ...search, reference: item.reference } })}
                      >
                        {item.reference}
                      </button>
                    </td>
                    <td>{item.leadPassengerName}</td>
                    <td>
                      {item.trip}
                      <small>Travelling {lookupDate(item.travelDate)}</small>
                    </td>
                    <td>{lookupShortDate(item.bookedAt)}</td>
                    <td>
                      <span className={`f3-lookup-chip is-${item.status}`}>{item.status}</span>
                    </td>
                    <td>
                      {item.openServiceRequests > 0 && <span className="f3-lookup-chip is-held">{item.openServiceRequests} pending</span>}
                    </td>
                    <td className="f3-lookup-right">{lookupMoney(item.total, item.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="f3-lookup-pagination">
          <p>
            Showing {start} to {end} of {page?.total ?? 0}
          </p>
          <div>
            <label className="f3-lookup-per-page">
              Per page
              <Select disabled={loading} value={String(query.pageSize ?? 20)} onValueChange={(value) => changePageSize(Number(value))}>
                <SelectTrigger
                  aria-label="Bookings per page"
                  className="data-[size=default]:h-7.5 w-15.5 px-2 text-xs text-[#677287] *:data-[slot=select-value]:text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button variant="outline" disabled={loading || (page?.page ?? 1) <= 1} onClick={() => changePage((page?.page ?? 1) - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={loading || !page || page.page * page.pageSize >= page.total}
              onClick={() => changePage(page!.page + 1)}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>
      <p className="f3-lookup-info">
        Click a booking to open its details. Search looks at every date; the filters only narrow the list when the search box is empty.
      </p>
      {reference && (
        <BookingDetailsDialog
          key={reference}
          reference={reference}
          onClose={() => void navigate({ to: '/booking-lookup', search: { ...search, reference: undefined }, replace: true })}
          onChanged={() => {
            setNotice(`Cancellation completed for ${reference}.`)
            reload()
          }}
        />
      )}
    </main>
  )
}
