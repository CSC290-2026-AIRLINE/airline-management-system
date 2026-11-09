import { Component, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { useBookingPnrApi } from '../api/client'
import type { StaffBookingPage, StaffBookingQuery } from '../api/types'
import { lookupDate, lookupMoney, lookupQuery, type LookupFilters } from './lookup-utils'
import { BookingDetailsDialog } from './BookingDetailsDialog'
import './lookup.css'

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

function LookupContent() {
  const { reference } = useSearch({ from: '/_authenticated/booking-lookup' })
  const navigate = useNavigate({ from: '/booking-lookup' })
  const currentApi = useBookingPnrApi(),
    api = useRef(currentApi)
  const [filters, setFilters] = useState<LookupFilters>({
    search: reference ?? '',
    dateType: 'booked',
    period: 'month',
    from: '',
    to: '',
    status: '',
  })
  const [query, setQuery] = useState<StaffBookingQuery>(() =>
    lookupQuery({ search: reference ?? '', dateType: 'booked', period: 'month', from: '', to: '', status: '' }),
  )
  const [page, setPage] = useState<StaffBookingPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const searchActive = !!filters.search.trim()
  useEffect(() => {
    api.current = currentApi
  }, [currentApi])
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
  function apply(event: FormEvent) {
    event.preventDefault()
    try {
      const next = lookupQuery(filters, 1, query.pageSize ?? 20)
      setLoading(true)
      setError(null)
      setFormError(null)
      setNotice(null)
      setQuery(next)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Check your filter values.')
    }
  }
  function reload() {
    setLoading(true)
    setError(null)
    setRefresh((value) => value + 1)
  }
  function changePage(value: number) {
    setLoading(true)
    setError(null)
    setQuery((current) => ({ ...current, page: value }))
  }
  const start = page?.items.length ? (page.page - 1) * page.pageSize + 1 : 0
  const end = page?.items.length ? start + page.items.length - 1 : 0
  return (
    <main className="f3-lookup">
      <header className="f3-lookup-heading">
        <div>
          <p className="f3-lookup-eyebrow">STAFF BOOKINGS</p>
          <h1>Bookings</h1>
        </div>
        <a href="/book-for-customer">Book for customer →</a>
      </header>
      <p className="f3-lookup-muted">
        All bookings, newest first. Filter by date or status, or search by reference, name, ticket number or passport.
      </p>
      <form className="f3-lookup-card f3-lookup-filters" onSubmit={apply} aria-label="Booking search and filters">
        <label className="f3-lookup-search">
          Search bookings
          <Input
            maxLength={200}
            placeholder="Reference, passenger name, ticket number or passport"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
        </label>
        <div className="f3-lookup-filter-row">
          <label>
            Date type
            <select
              disabled={searchActive}
              value={filters.dateType}
              onChange={(event) => setFilters({ ...filters, dateType: event.target.value as LookupFilters['dateType'] })}
            >
              <option value="booked">Booked on</option>
              <option value="travelling">Travelling on</option>
            </select>
          </label>
          <label>
            Period
            <select
              disabled={searchActive}
              value={filters.period}
              onChange={(event) => setFilters({ ...filters, period: event.target.value as LookupFilters['period'] })}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="last_year">Last year</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          <label>
            Status
            <select
              disabled={searchActive}
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value as LookupFilters['status'] })}
            >
              <option value="">All statuses</option>
              <option value="held">Held</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <Button type="submit" disabled={loading} className="f3-lookup-primary">
            {loading ? 'Loading…' : 'Search bookings'}
          </Button>
        </div>
        {filters.period === 'custom' && (
          <div className="f3-lookup-custom">
            <label>
              From
              <Input
                type="date"
                disabled={searchActive}
                required={!searchActive}
                max={filters.to || undefined}
                value={filters.from}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
            </label>
            <label>
              To
              <Input
                type="date"
                disabled={searchActive}
                required={!searchActive}
                min={filters.from || undefined}
                value={filters.to}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
            </label>
          </div>
        )}
        <p className="f3-lookup-hint">
          Search looks across every date. Date and status filters apply only when the search box is empty. Dates are in UTC.
        </p>
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
          <span>
            {query.search
              ? `Search: “${query.search}”`
              : `${query.dateType === 'travelling' ? 'Travelling' : 'Booked'} ${query.from ?? 'any date'}${query.to ? ` to ${query.to}` : ''}`}{' '}
            · newest first
          </span>
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
                        onClick={() => void navigate({ to: '/booking-lookup', search: { reference: item.reference } })}
                      >
                        {item.reference}
                      </button>
                    </td>
                    <td>{item.leadPassengerName}</td>
                    <td>
                      {item.trip}
                      <small>Travelling {lookupDate(item.travelDate)}</small>
                    </td>
                    <td>{lookupDate(item.bookedAt)}</td>
                    <td>
                      <span className={`f3-lookup-chip is-${item.status}`}>{item.status}</span>
                    </td>
                    <td>
                      {item.openServiceRequests > 0 ? (
                        <span className="f3-lookup-chip is-held">{item.openServiceRequests} open</span>
                      ) : (
                        'None'
                      )}
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
            <label>
              Per page
              <select
                aria-label="Bookings per page"
                disabled={loading}
                value={query.pageSize ?? 20}
                onChange={(event) => {
                  setLoading(true)
                  setError(null)
                  setQuery((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))
                }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
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
      {reference && (
        <BookingDetailsDialog
          key={reference}
          reference={reference}
          onClose={() => void navigate({ to: '/booking-lookup', search: {}, replace: true })}
          onChanged={() => {
            setNotice(`Cancellation completed for ${reference}.`)
            reload()
          }}
        />
      )}
    </main>
  )
}
