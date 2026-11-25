import { Component, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardFooter } from '@staff-web/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@staff-web/components/ui/empty'
import { Field, FieldLabel } from '@staff-web/components/ui/field'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
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

/** Radix `Select` items cannot have an empty value, so the "no status filter" row gets its own marker. */
const ALL_STATUSES = '__all__'

class LookupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <main className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 lg:px-[4%] lg:pt-12 lg:pb-16 [&_h1]:text-2xl [&_h1]:leading-tight [&_h1]:font-bold [&_h1]:tracking-tight sm:[&_h1]:text-3xl [&_h2]:text-base [&_h2]:font-semibold">
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
  /** Opens the details of one booking. The reference in the URL is what the details dialog reads. */
  function openBooking(reference: string) {
    void navigate({ to: '/booking-lookup', search: { ...search, reference } })
  }
  /**
   * The same thing for a click anywhere in the row. A click that ends a text selection is a copy, not a click on the
   * booking, so it is left alone.
   */
  function openRow(reference: string) {
    if (window.getSelection()?.toString()) return
    openBooking(reference)
  }
  const start = page?.items.length ? (page.page - 1) * page.pageSize + 1 : 0
  const end = page?.items.length ? start + page.items.length - 1 : 0
  const range = `${query.dateType === 'travelling' ? 'Travelling' : 'Booked'} ${
    query.from ? lookupDate(query.from) : 'any date'
  }${query.to ? ` to ${lookupDate(query.to)}` : ''}`
  return (
    <main className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 lg:px-[4%] lg:pt-12 lg:pb-16">
      <header className="space-y-1">
        <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">Bookings</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          All bookings, newest first. Filter by date or status, or search by reference, name, flight, ticket number or passport.
        </p>
      </header>
      <Card>
        <CardContent>
          <form onSubmit={submit} aria-label="Booking search and filters" className="space-y-4">
            <div
              className={`grid grid-cols-1 items-end gap-4 sm:grid-cols-2 ${filters.period === 'custom' ? 'xl:grid-cols-[minmax(0,1fr)_140px_150px_145px_145px_120px]' : 'lg:grid-cols-[minmax(0,1fr)_150px_150px_130px]'}`}
            >
              <Field className="sm:col-span-2 lg:col-span-1">
                <FieldLabel htmlFor="lookup-search">Search</FieldLabel>
                <Input
                  id="lookup-search"
                  maxLength={200}
                  placeholder="Reference, name, flight or ticket"
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lookup-date-type">Date type</FieldLabel>
                <Select value={filters.dateType} onValueChange={(value) => changeFilter('dateType', value as LookupFilters['dateType'])}>
                  <SelectTrigger id="lookup-date-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="booked">Booked on</SelectItem>
                    <SelectItem value="travelling">Travelling on</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="lookup-period">Period</FieldLabel>
                <Select value={filters.period} onValueChange={(value) => changePeriod(value as LookupPeriod)}>
                  <SelectTrigger id="lookup-period" className="w-full">
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
              </Field>
              {filters.period === 'custom' && (
                <>
                  <Field>
                    <FieldLabel htmlFor="lookup-from">From</FieldLabel>
                    <Input
                      id="lookup-from"
                      type="date"
                      max={filters.to || undefined}
                      value={filters.from}
                      onChange={(event) => changeFilter('from', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="lookup-to">To</FieldLabel>
                    <Input
                      id="lookup-to"
                      type="date"
                      min={filters.from || undefined}
                      value={filters.to}
                      onChange={(event) => changeFilter('to', event.target.value)}
                    />
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel htmlFor="lookup-status">Status</FieldLabel>
                <Select
                  value={filters.status || ALL_STATUSES}
                  onValueChange={(value) => changeFilter('status', (value === ALL_STATUSES ? '' : value) as LookupFilters['status'])}
                >
                  <SelectTrigger id="lookup-status" className="w-full">
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
              </Field>
            </div>
            {formError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>
      {notice && (
        <Alert role="status">
          <CircleCheck />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={reload}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Card className="gap-0 overflow-hidden py-0" aria-label="Booking results" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
          <p className="font-semibold" aria-live="polite">
            {loading ? 'Loading bookings…' : `${page?.total ?? 0} ${page?.total === 1 ? 'booking' : 'bookings'}`}
          </p>
          <span className="text-right text-xs text-muted-foreground">
            {query.search ? `Search: “${query.search}”` : range} · newest first
          </span>
        </div>
        {!loading && page?.items.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No bookings found</EmptyTitle>
              <EmptyDescription>Try another search or adjust the filters.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!loading && !!page?.items.length && (
          <>
            <p className="px-4 pt-3 text-xs text-muted-foreground">Select a booking to open its details.</p>
            <Table className="max-lg:[&_thead]:sr-only max-lg:[&_tr]:block max-lg:[&_tr]:px-4 max-lg:[&_tr]:py-3 max-lg:[&_td]:block max-lg:[&_td]:px-0 max-lg:[&_td]:py-1">
              <TableCaption className="sr-only">Staff bookings. Select a booking to open its details.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Booking</TableHead>
                  <TableHead>Lead passenger</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead className="lg:max-xl:hidden">Booked</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assistance</TableHead>
                  <TableHead className="pr-5 text-right tabular-nums">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((item) => (
                  <TableRow key={item.bookingId} className="cursor-pointer" onClick={() => openRow(item.reference)}>
                    <TableCell className="pl-5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 font-mono font-semibold text-primary"
                        title={`Open booking ${item.reference}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          openBooking(item.reference)
                        }}
                      >
                        {item.reference}
                        <ChevronRight className="text-muted-foreground" aria-hidden="true" />
                      </Button>
                    </TableCell>
                    <TableCell>{item.leadPassengerName}</TableCell>
                    <TableCell>
                      {item.trip}
                      <small className="mt-0.5 block text-xs text-muted-foreground">
                        Travelling {lookupDate(item.travelDate, false, item.travelTimeZone)}
                      </small>
                    </TableCell>
                    <TableCell className="lg:max-xl:hidden">{lookupShortDate(item.bookedAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      {item.openServiceRequests > 0 && <StatusBadge status="requested" label={`${item.openServiceRequests} pending`} />}
                    </TableCell>
                    <TableCell className="pr-5 text-right tabular-nums">{lookupMoney(item.total, item.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        <CardFooter className="flex-wrap justify-between gap-4 border-t py-3 text-xs text-muted-foreground">
          <p>
            Showing {start} to {end} of {page?.total ?? 0}
          </p>
          <nav className="flex items-center justify-end gap-2" aria-label="Booking result pages">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || (page?.page ?? 1) <= 1}
              onClick={() => changePage((page?.page ?? 1) - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !page || page.page * page.pageSize >= page.total}
              onClick={() => changePage(page!.page + 1)}
            >
              Next
            </Button>
          </nav>
        </CardFooter>
      </Card>
      <Alert>
        <AlertDescription>Search looks at every date; the filters only narrow the list when the search box is empty.</AlertDescription>
      </Alert>
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
