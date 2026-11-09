import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { formatDateTime, formatServiceDate } from '../format'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import type { AirportRow, CongestionRow } from '../types'
import '../flight-scheduling.css'

const EMPTY = { airport: '', date: '', from: '', to: '', limit: '1', reason: '' }

export function CongestionPage() {
  const { reasons } = useDisruptionReasons()
  const { fetchWithAuth } = useAppAuth()
  const airports = usePagedList<AirportRow>('/airports?is_active=true&limit=100', fetchWithAuth)
  const windows = usePagedList<CongestionRow>('/congestion', fetchWithAuth)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  const zone = (code: string) => airports.rows.find((a) => a.iata_code === code)?.timezone ?? 'UTC'
  const windowLabel = (w: CongestionRow) =>
    `${formatDateTime(w.starts_at, zone(w.airport))} to ${formatDateTime(w.ends_at, zone(w.airport)).slice(-5)}`
  const reasonLabel = (code: string) => reasons.find((r) => r.code === code)?.label ?? code
  const overLimit = windows.rows.filter((w) => w.over_limit.length > 0)

  const ready =
    form.airport !== '' && form.date !== '' && form.from !== '' && form.to !== '' && Number(form.limit) >= 1 && form.reason !== ''

  async function send(path: string, init: RequestInit) {
    const res = await fetchWithAuth(`${BASE}${path}`, init)
    if (!res.ok) throw new Error(await errorMessage(res))
  }

  async function record(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await send('/congestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          airport: form.airport,
          date: form.date,
          from: form.from,
          to: form.to,
          max_movement_per_hour: Number(form.limit),
          disruption_reason_code: form.reason,
        }),
      })
      say('Window recorded.')
      setForm(EMPTY)
      windows.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(w: CongestionRow) {
    try {
      await send(`/congestion/${w.id}`, { method: 'DELETE' })
      say('Window removed.')
      windows.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Congestion">
          Record a window in which an airport can only handle so many movements. Flights over the limit get a congestion conflict with a
          proposed delay that moves them past the window.
        </PageHeader>

        <ListState
          loading={windows.loading}
          error={windows.error}
          empty={windows.rows.length === 0}
          noun="congestion windows"
          emptyText="No congestion windows recorded."
        />
        {windows.rows.length > 0 && (
          <TableWrap>
            <table className="fs-table fs-t-congestion">
              <thead>
                <tr>
                  <th>Airport</th>
                  <th>Window</th>
                  <th>Limit</th>
                  <th>Movements</th>
                  <th>State</th>
                  <th>Disruption reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {windows.rows.map((w) => (
                  <tr key={w.id}>
                    <td className="fs-flight fs-plain">{w.airport}</td>
                    <td>{windowLabel(w)}</td>
                    <td>{w.max_movement_per_hour} per hour</td>
                    <td>
                      {w.peak_movements} of {w.max_movement_per_hour}
                    </td>
                    <td>
                      <StatusPill
                        status={w.over_limit.length > 0 ? 'cancelled' : 'active'}
                        label={w.over_limit.length > 0 ? 'Over limit' : 'Within limit'}
                      />
                    </td>
                    <td>{reasonLabel(w.disruption_reason_code)}</td>
                    <td>
                      <button type="button" className="fs-button-light" onClick={() => void remove(w)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        {overLimit.length > 0 && (
          <Card>
            <h2>Flights over the limit</h2>
            <p className="fs-sub">Each one gets a congestion conflict on the Conflicts page, with a delay that moves it past the window.</p>
            <TableWrap spaced>
              <table className="fs-table fs-t-over">
                <thead>
                  <tr>
                    <th>Flight</th>
                    <th>Movement</th>
                    <th>Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {overLimit.flatMap((w) =>
                    w.over_limit.map((o) => {
                      const later = Math.ceil((new Date(w.ends_at).getTime() - new Date(o.at).getTime()) / 60000)
                      return (
                        <tr key={`${w.id}-${o.flight_id}`}>
                          <td>
                            <span className="fs-flight">{o.flight_number}</span>{' '}
                            <span className="fs-to">{formatServiceDate(o.service_date)}</span>
                          </td>
                          <td>
                            {o.kind === 'departs' ? 'Departs' : 'Arrives'} {w.airport} {formatDateTime(o.at, zone(w.airport)).slice(-5)}
                          </td>
                          <td>
                            {w.airport} is congested from {windowLabel(w)}: {w.peak_movements} movements scheduled in the busiest hour,
                            limit {w.max_movement_per_hour}. Proposed: move {o.flight_number} about {later} minutes later, past the window.
                          </td>
                        </tr>
                      )
                    }),
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}

        <Card as="form" onSubmit={(e) => void record(e)}>
          <h2>Record a congestion window</h2>
          <div className="fs-form-grid">
            <SelectField label="Airport" value={form.airport} onChange={(e) => setForm({ ...form, airport: e.target.value })}>
              <option value="">Choose an airport</option>
              {airports.rows.map((a) => (
                <option key={a.iata_code} value={a.iata_code}>
                  {a.iata_code} · {a.city}
                </option>
              ))}
            </SelectField>
            <FormField label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <FormField half label="From" type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            <FormField half label="To" type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            <FormField
              label="Max movements per hour"
              type="number"
              min={1}
              value={form.limit}
              onChange={(e) => setForm({ ...form, limit: e.target.value })}
            />
            <SelectField label="Disruption reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              <option value="">Choose a disruption reason</option>
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </SelectField>
          </div>
          <p className="fs-sub">
            Movements are scheduled departures and arrivals, counted per hour from the window start; the last hour is prorated when the
            window does not end on the hour.
          </p>
          {error && (
            <p className="fs-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="fs-button fs-mt" disabled={!ready || busy}>
            Record window
          </button>
        </Card>
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
