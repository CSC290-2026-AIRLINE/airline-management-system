import { useState } from 'react'
import { usePagedList } from './usePagedList'
import './flights.css'

const STATUSES = ['scheduled', 'delayed', 'holding', 'diverted', 'cancelled', 'departed', 'arrived'] as const

interface FlightRow {
  id: string
  flight_number: string
  service_date: string
  route_id: string
  scheduled_dep_at: string
  dep_at: string
  arr_at: string
  actual_destination: string | null
  status: string
}

interface RouteRow {
  id: string
  origin: string
  destination: string
}

// ponytail: shown in UTC; origin-local time needs the airport timezone (GET /flights/:id has it), add when a detail view exists.
const time = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
const utc = (iso: string) => `${time.format(new Date(iso))} UTC`
const delayMinutes = (f: FlightRow) => Math.round((Date.parse(f.dep_at) - Date.parse(f.scheduled_dep_at)) / 60000)

export function FlightsPage() {
  const [status, setStatus] = useState('')
  const [serviceDate, setServiceDate] = useState('')

  const query = new URLSearchParams({ ...(status && { status }), ...(serviceDate && { service_date: serviceDate }) }).toString()
  const flights = usePagedList<FlightRow>(`/flights${query && `?${query}`}`)
  // ponytail: first 100 routes label the list; a route beyond that shows its id until the list returns route codes.
  const routes = usePagedList<RouteRow>('/routes?limit=100')
  const routeLabel = new Map(routes.rows.map((r) => [r.id, `${r.origin} → ${r.destination}`]))

  return (
    <main className="fs-page">
      <h1>Flights</h1>

      <form className="fs-filters" onSubmit={(e) => e.preventDefault()}>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service date
          <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
        </label>
        <button type="button" onClick={() => (setStatus(''), setServiceDate(''))} disabled={!status && !serviceDate}>
          Clear
        </button>
      </form>

      {flights.error && <p role="alert">Could not load flights: {flights.error}</p>}
      {flights.loading && <p>Loading flights…</p>}
      {!flights.loading && !flights.error && flights.rows.length === 0 && <p>No flights match these filters.</p>}

      {flights.rows.length > 0 && (
        <table className="fs-table">
          <thead>
            <tr>
              <th>Flight</th>
              <th>Route</th>
              <th>Departs</th>
              <th>Arrives</th>
              <th>Delay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {flights.rows.map((f) => (
              <tr key={f.id}>
                <td>{f.flight_number}</td>
                <td>
                  {routeLabel.get(f.route_id) ?? f.route_id.slice(0, 8)}
                  {f.actual_destination && <> (diverted to {f.actual_destination})</>}
                </td>
                <td>{utc(f.dep_at)}</td>
                <td>{utc(f.arr_at)}</td>
                <td>{delayMinutes(f) > 0 ? `+${delayMinutes(f)} min` : '–'}</td>
                <td>
                  <span className={`fs-status fs-status-${f.status}`}>{f.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {flights.hasMore && (
        <button type="button" onClick={() => void flights.loadMore()} disabled={flights.loadingMore}>
          {flights.loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </main>
  )
}
