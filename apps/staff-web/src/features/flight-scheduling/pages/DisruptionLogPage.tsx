import { Link } from '@tanstack/react-router'
import { Fragment, useState } from 'react'
import { NotConnected } from '../components/NotConnected'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { EmptyState } from '../components/EmptyState'
import { TableWrap } from '../components/TableWrap'
import { CONNECTED } from '../connected'
import { DISRUPTION_CATEGORIES, type DisruptionLogRow } from '../types'
import '../flight-scheduling.css'

const TONE: Record<string, string> = {
  'flight.departed': 'departed',
  'flight.delayed': 'delayed',
  'flight.created': 'active',
  'flight.cancelled': 'cancelled',
}

// The backend lists events per flight only (GET /flights/:id/events). The log stays hidden until an endpoint lists every flight's events.
export function DisruptionLogPage() {
  const [show, setShow] = useState('all')
  const [category, setCategory] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  // ponytail: load these from the all-flights events endpoint once it exists.
  const events: DisruptionLogRow[] = []
  const rows = events.filter((e) => (show === 'all' || e.category !== '') && (category === '' || e.category === category))

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Disruption log">
          Every change is one row here and one event on the stream, ordered by sequence number. Select a flight number to see the exact
          payload subscribers receive.
        </PageHeader>
        {!CONNECTED.eventLog && (
          <NotConnected>
            There is no endpoint that lists events across all flights yet, so the log is hidden. Each flight's own history is on its detail
            page.
          </NotConnected>
        )}

        {CONNECTED.eventLog && (
          <>
            <div className="fs-filters">
              <label>
                Show
                <select className="fs-select" value={show} onChange={(e) => setShow(e.target.value)}>
                  <option value="all">All events</option>
                  <option value="disruptions">Disruptions only</option>
                </select>
              </label>
              <SelectField label="Disruption category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {DISRUPTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
            </div>

            {rows.length === 0 ? (
              <EmptyState>
                <p>No events match these filters.</p>
              </EmptyState>
            ) : (
              <TableWrap>
                <table className="fs-table fs-t-dlog">
                  <thead>
                    <tr>
                      <th>Occurred (simulation)</th>
                      <th>Flight</th>
                      <th>Event</th>
                      <th>Disruption reason</th>
                      <th>Detail</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => {
                      const key = `${e.at}-${e.flight}-${e.date}-${e.event}`
                      return (
                        <Fragment key={key}>
                          <tr>
                            <td>{e.at}</td>
                            <td>
                              <button type="button" className="fs-link" onClick={() => setOpen(open === key ? null : key)}>
                                {e.flight}
                              </button>{' '}
                              <span className="fs-to">{e.date}</span>
                            </td>
                            <td>
                              <StatusPill status={TONE[e.event] ?? 'scheduled'} label={e.event} />
                            </td>
                            <td className={e.reason ? undefined : 'fs-to'}>{e.reason || 'none'}</td>
                            <td>{e.detail}</td>
                            <td className="fs-to">{e.by}</td>
                          </tr>
                          {open === key && (
                            <tr>
                              <td colSpan={6}>
                                <pre className="fs-payload">
                                  {JSON.stringify(
                                    {
                                      type: e.event,
                                      flight_number: e.flight,
                                      service_date: e.date,
                                      disruption_reason: e.reason || null,
                                      detail: e.detail,
                                      by: e.by,
                                    },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}

        <p className="fs-sub">
          Disruption reasons are a fixed list with a fixed category (weather, technical, crew, air traffic control, security, airport
          operations, other), so subscribers group by disruption_category and never parse the note. Events are append-only.{' '}
          <Link to="/schedule-board">Back to the schedule board</Link>
        </p>
      </main>
    </StaffShell>
  )
}
