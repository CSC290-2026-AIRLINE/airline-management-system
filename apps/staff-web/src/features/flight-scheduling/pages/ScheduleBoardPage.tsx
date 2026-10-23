import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { BatchActions } from '../components/BatchActions'
import { ListState } from '../components/ListState'
import { PageHeader } from '../components/PageHeader'
import { RouteCodes } from '../components/RouteCodes'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { Stats } from '../components/Stats'
import { TableWrap } from '../components/TableWrap'
import { capitalize } from '../format'
import { publicFetch, usePagedList } from '../hooks/usePagedList'
import { openConflictCount } from '../connected'
import { FLIGHT_STATUSES, type FlightRow, type RouteRow } from '../types'
import '../flight-scheduling.css'

// The staff design shows Bangkok time (UTC+07:00).
// ponytail: fixed zone; read the origin airport's timezone (GET /flights/:id has it) when other zones matter.
const ZONE = 'Asia/Bangkok'
const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: ZONE })
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE })
const day = (iso: string) => dayFormat.format(new Date(iso))
const clock = (iso: string) => timeFormat.format(new Date(iso))

const DISRUPTED = ['delayed', 'holding', 'diverted']

export function ScheduleBoardPage() {
  const [routeId, setRouteId] = useState('')
  const [serviceDate, setServiceDate] = useState('')
  const [status, setStatus] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const query = new URLSearchParams({
    ...(routeId && { route_id: routeId }),
    ...(serviceDate && { service_date: serviceDate }),
    ...(status && { status }),
  }).toString()
  const flights = usePagedList<FlightRow>(`/flights${query && `?${query}`}`)
  // ponytail: first 100 routes feed the filter and the route column; page through them when there are more.
  const routes = usePagedList<RouteRow>('/routes?limit=100')
  const routeById = new Map(routes.rows.map((r) => [r.id, r]))

  const filtered = query !== ''
  const clearFilters = () => {
    setRouteId('')
    setServiceDate('')
    setStatus('')
  }

  const rows = flights.rows
  const openConflicts = openConflictCount()
  const selected = rows.filter((f) => picked.has(f.id))
  const allPicked = rows.length > 0 && selected.length === rows.length
  const togglePicked = (id: string) => {
    const next = new Set(picked)
    if (!next.delete(id)) next.add(id)
    setPicked(next)
  }

  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((f) => f.id)))

  const route = routeById.get(routeId)
  const filterSummary = [
    route ? `${route.origin} to ${route.destination}` : 'All routes',
    serviceDate || 'All dates',
    status ? capitalize(status) : 'All statuses',
  ].join(' · ')

  const disrupted = rows.filter((f) => DISRUPTED.includes(f.status)).length
  const cancelled = rows.filter((f) => f.status === 'cancelled').length

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader
          title="Schedule board"
          action={
            <Link to="/generate-flights" className="fs-button">
              Generate flights
            </Link>
          }
        >
          Every confirmed flight, in departure order. Open a flight to change its aircraft or record a disruption, or tick several for a
          batch action. To add flights, use Generate flights: they are previewed first and saved only when they pass the checks, hold an
          approval and you confirm them.
        </PageHeader>

        <Stats
          items={[
            {
              value: (
                <>
                  {rows.length}
                  {flights.hasMore && '+'}
                </>
              ),
              label: 'flights in view',
            },
            { value: disrupted, label: 'delayed, holding or diverted' },
            { value: cancelled, label: 'cancelled' },
            ...(openConflicts === null ? [] : [{ value: openConflicts, label: 'open conflict' }]),
          ]}
        />

        {/* On a phone the filters fold behind a summary row; on desktop the toggle is hidden and the form always shows. */}
        <div className={filtersOpen ? 'fs-filterbox is-open' : 'fs-filterbox'}>
          <button type="button" className="fs-filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
            <strong>Filters</strong>
            <span>{filterSummary}</span>
          </button>
          <form className="fs-filters" onSubmit={(e) => e.preventDefault()}>
            <label>
              Route
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">All routes</option>
                {routes.rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.origin} to {r.destination}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </label>
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {FLIGHT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {capitalize(s)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="fs-filter-clear" onClick={clearFilters}>
              Clear filters
            </button>
          </form>
        </div>

        {rows.length > 0 && (
          <label className="fs-selectall">
            <input type="checkbox" checked={allPicked} onChange={toggleAll} />
            Select all · {rows.length} flights
          </label>
        )}

        <BatchActions
          selected={selected}
          // ponytail: the board is outside the signed-in layout, so this is a plain fetch; move the board under routes/_authenticated/ and pass useAppAuth().fetchWithAuth once the TEMP public routes are removed.
          fetcher={publicFetch}
          onClear={() => setPicked(new Set())}
          onApply={flights.reload}
        />

        <ListState
          loading={flights.loading}
          error={flights.error}
          empty={rows.length === 0}
          noun="flights"
          emptyText={filtered ? 'No flights match these filters.' : 'No flights have been created yet.'}
        >
          {filtered && (
            <button type="button" className="fs-button-light" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </ListState>

        {rows.length > 0 && (
          <TableWrap>
            <table className="fs-table fs-t-board">
              <thead>
                <tr>
                  <th className="fs-check">
                    <input type="checkbox" aria-label="Select all flights" checked={allPicked} onChange={toggleAll} />
                  </th>
                  <th>Flight</th>
                  <th>Route</th>
                  <th>Date</th>
                  <th>Departs</th>
                  <th>Arrives</th>
                  <th>Aircraft</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} className={picked.has(f.id) ? 'fs-row-picked' : undefined}>
                    <td className="fs-check">
                      <input
                        type="checkbox"
                        aria-label={`Select ${f.flight_number} on ${f.service_date.slice(0, 10)}`}
                        checked={picked.has(f.id)}
                        onChange={() => togglePicked(f.id)}
                      />
                    </td>
                    <td className="fs-flight">
                      <Link to="/flights/$flightId" params={{ flightId: f.id }}>
                        {f.flight_number}
                      </Link>
                    </td>
                    <td className="fs-route">
                      <RouteCodes route={routeById.get(f.route_id)} fallback={f.route_id.slice(0, 8)} />
                      {f.actual_destination && <> (diverted to {f.actual_destination})</>}
                    </td>
                    <td>{day(f.dep_at)}</td>
                    <td>
                      {f.dep_at !== f.scheduled_dep_at && <s className="fs-was">{clock(f.scheduled_dep_at)}</s>} {clock(f.dep_at)}
                    </td>
                    <td>{clock(f.arr_at)}</td>
                    <td>{f.aircraft.tail_number}</td>
                    <td>
                      <StatusPill status={f.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        {flights.hasMore && (
          <button type="button" onClick={() => void flights.loadMore()} disabled={flights.loadingMore}>
            {flights.loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </main>
    </StaffShell>
  )
}
