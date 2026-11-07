import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import type { StaffApi } from '../api/index.ts'
import type { FlightSummary, StaffCheckInRow, StaffCheckInView } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { PassengerPanel } from './PassengerPanel.tsx'
import { IssuePills, StatusPill } from './pills.tsx'
import { messageOf } from './errors.ts'
import { applyFilter, fallbackQuery, parseSearch, type CounterFilter } from './counter-search.ts'
import { formatTime } from '../domain/format.ts'
import { computeWindow, DEFAULT_WINDOW_SETTINGS } from '../domain/window.ts'
import {
  CHIP_ACTIVE,
  CHIP_IDLE,
  INPUT_LABEL,
  MUTED,
  PANEL,
  PANEL_TITLE,
  PRIMARY_BUTTON,
  ROW_BUTTON,
  SECONDARY_BUTTON,
  TEXT_INPUT,
} from './styles.ts'

export function CounterPage({ api }: { api: StaffApi }) {
  const [flights, setFlights] = useState<FlightSummary[]>([])
  const [text, setText] = useState('')
  const [rows, setRows] = useState<StaffCheckInRow[]>([])
  const [filter, setFilter] = useState<CounterFilter>('all')
  const [searched, setSearched] = useState(false)
  const [view, setView] = useState<StaffCheckInView | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The flight list failed; the searches still work, so this error has its own place in the banner. */
  const [flightsError, setFlightsError] = useState<string | null>(null)
  /** The flight list is needed to read a flight number from the search box, so the search waits for it. */
  const flightsReady = useRef<Promise<FlightSummary[]>>(Promise.resolve([]))

  useEffect(() => {
    let cancelled = false
    const promise = api.flights()
    // The flights only resolve a flight number, so a failure must not break a search by name or booking ref.
    flightsReady.current = promise.catch(() => [])
    promise
      .then((list) => {
        if (!cancelled) setFlights(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setFlightsError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const search = useCallback(
    async (query: string) => {
      const list = await flightsReady.current
      const parsed = parseSearch(query, list)
      const found = await api.search(parsed)
      // A six-letter surname reads as a booking ref, so when that finds nobody the same text is searched as a name.
      const fallback = fallbackQuery(parsed, query)
      if (found.length === 0 && fallback) return api.search(fallback)
      return found
    },
    [api],
  )

  /** The rows the table shows. */
  const showResults = useCallback((found: StaffCheckInRow[]) => {
    setError(null)
    setRows(found)
    setSearched(true)
    setFilter('all')
  }, [])

  const runSearch = useCallback(
    async (query: string) => {
      try {
        showResults(await search(query))
      } catch (err) {
        setError(messageOf(err))
      }
    },
    [search, showResults],
  )

  // The counter shows today's passengers straight away.
  useEffect(() => {
    let cancelled = false
    search('')
      .then((found) => {
        if (!cancelled) showResults(found)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [search, showResults])

  // The issue list links here with ?checkIn=<id>, so that passenger opens straight away.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('checkIn')
    if (!id) return
    let cancelled = false
    api
      .detail(id)
      .then((detail) => {
        if (!cancelled) setView(detail)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const open = async (id: string) => {
    setError(null)
    try {
      setView(await api.detail(id))
    } catch (err) {
      setError(messageOf(err))
    }
  }

  /** The counter actions change the issue list, so the table is refreshed with them. */
  const onUpdated = (updated: StaffCheckInView) => {
    setView(updated)
    void runSearch(text)
  }

  const visible = applyFilter(rows, filter)
  const counts = {
    all: rows.length,
    not_started: rows.filter((row) => row.status === 'started').length,
    on_hold: rows.filter((row) => row.status === 'on_hold').length,
    issues: rows.filter((row) => row.issues.length > 0).length,
  }
  /** The rows of one flight share a heading; a search over several flights is just "Passengers". */
  const oneFlight =
    rows.length > 0 && rows.every((row) => row.flightNumber === rows[0].flightNumber)
      ? (flights.find((item) => item.flightNumber === rows[0].flightNumber) ?? null)
      : null
  const heading = oneFlight
    ? `${oneFlight.flightNumber} · ${oneFlight.origin.city} to ${oneFlight.destination.city} · departs ${formatTime(oneFlight.depAt)}`
    : 'Passengers'
  const closesAt = oneFlight ? formatTime(computeWindow(new Date(oneFlight.depAt), DEFAULT_WINDOW_SETTINGS).closesAt.toISOString()) : null
  const subtitle = view
    ? `BKK · Counter 4 · ${view.checkIn.flight.flightNumber} · ${view.checkIn.flight.origin.city} to ${view.checkIn.flight.destination.city} · departs ${formatTime(
        view.checkIn.flight.depAt,
      )} · check-in closes ${formatTime(view.checkIn.window.closesAt)}`
    : 'BKK · Counter 4. Search by flight, name or booking ref. You can do every passenger step here.'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 font-sans text-[36px] font-extrabold leading-[1.1] tracking-tight text-[#0a1424]">Check-in counter</h1>
          <p className={`mt-1 ${MUTED}`}>{subtitle}</p>
        </div>
        {view ? (
          <Button type="button" variant="outline" size="sm" className={SECONDARY_BUTTON} onClick={() => setView(null)}>
            Back to search
          </Button>
        ) : null}
      </div>

      <ErrorBanner
        message={error ?? flightsError}
        onDismiss={() => {
          setError(null)
          setFlightsError(null)
        }}
      />

      {view ? (
        <PassengerPanel key={view.checkIn.id} api={api} view={view} onUpdated={onUpdated} />
      ) : (
        <>
          <Card className={PANEL}>
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void runSearch(text)
              }}
            >
              <Label htmlFor="counter-search" className={INPUT_LABEL}>
                Flight, name or booking ref
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="counter-search"
                  className={`${TEXT_INPUT} w-[620px]`}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="FY 204"
                  autoComplete="off"
                />
                <Button type="submit" className={PRIMARY_BUTTON}>
                  Search
                </Button>
              </div>
            </form>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter passengers">
              {(
                [
                  ['all', 'All'],
                  ['not_started', 'Not started'],
                  ['on_hold', 'On hold'],
                  ['issues', 'Issues'],
                ] as Array<[CounterFilter, string]>
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={filter === key}
                  className={filter === key ? CHIP_ACTIVE : CHIP_IDLE}
                  onClick={() => setFilter(key)}
                >
                  {label} ({counts[key]})
                </Button>
              ))}
            </div>
          </Card>

          <Card className={PANEL}>
            <h2 className={PANEL_TITLE}>{heading}</h2>
            <p className={MUTED}>
              {closesAt
                ? `Check-in closes ${closesAt} (1 hour before departure, simulation clock). ${rows.length} booked ${rows.length === 1 ? 'passenger' : 'passengers'}.`
                : `${rows.length} booked ${rows.length === 1 ? 'passenger' : 'passengers'}.`}
            </p>
            {visible.length === 0 ? (
              <p className={MUTED}>{searched ? 'No passenger matches the search.' : 'Search by flight, name or booking ref.'}</p>
            ) : (
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="border-[#dbe2ea] hover:bg-transparent">
                    <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">Passenger</TableHead>
                    <TableHead className="h-auto w-[14%] px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">
                      Booking
                    </TableHead>
                    <TableHead className="h-auto w-[9%] px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">
                      Seat
                    </TableHead>
                    <TableHead className="h-auto w-[17%] px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">
                      Bags
                    </TableHead>
                    <TableHead className="h-auto w-[12%] px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">
                      Status
                    </TableHead>
                    <TableHead className="h-auto px-3 py-2" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id} className="border-[#eef1f6] hover:bg-[#f7f9fc]">
                      <TableCell className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#0a1424]">{row.passengerName}</span>
                          <IssuePills issues={row.issues} />
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-sm text-[#677287]">{row.pnr}</TableCell>
                      {/* The search row carries no seat and no bag counts; the passenger panel shows both. */}
                      <TableCell className="px-3 py-3 text-sm text-[#0a1424]">—</TableCell>
                      <TableCell className="px-3 py-3 text-sm text-[#0a1424]">—</TableCell>
                      <TableCell className="px-3 py-3">
                        <StatusPill status={row.status} />
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right">
                        <Button type="button" variant="outline" size="sm" className={ROW_BUTTON} onClick={() => void open(row.id)}>
                          {row.status === 'started' ? 'Start' : 'Open'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
