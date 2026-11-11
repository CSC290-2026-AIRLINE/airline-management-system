import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Callout } from '../components/Callout'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { NotConnected } from '../components/NotConnected'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { Stats } from '../components/Stats'
import { StatusPill } from '../components/StatusPill'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { offerText, STATUS_LABEL, TONE } from '../approval-labels'
import { CONNECTED } from '../connected'
import { formatDateTime, formatServiceDate, localParts, localToIso } from '../format'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import type { AirportRow, ApprovalRow, ApprovalStatus } from '../types'
import '../flight-scheduling.css'

// Every request sent to the simulated approver, from GET /approvals. Revising posts a new request (POST /approvals/:id/revise); an
// offered time that an earlier offer already covers is approved at once, otherwise the approver answers again.
export function ApprovalsPage() {
  const { fetchWithAuth } = useAppAuth()
  const approvals = useResource<ApprovalRow[]>(CONNECTED.approvalQueue ? '/approvals?limit=100' : null, fetchWithAuth)
  const airports = usePagedList<AirportRow>('/airports?limit=100', fetchWithAuth)
  const [status, setStatus] = useState('')
  const [flight, setFlight] = useState('')
  const [revising, setRevising] = useState<ApprovalRow | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  const rows = approvals.data ?? []
  const zone = (r: ApprovalRow) => airports.rows.find((a) => a.iata_code === r.approver_airport)?.timezone ?? 'UTC'
  const count = (s: ApprovalStatus) => rows.filter((r) => r.status === s).length
  const shown = rows.filter((r) => (status === '' || r.status === status) && (flight === '' || r.flight_number === flight))

  function open(r: ApprovalRow) {
    setRevising(r)
    // Start from the first offered time, or the time that was requested. An offer can be on the next local day, so the date
    // is picked too.
    const start = localParts(r.offers[0]?.starts_at ?? r.proposed_dep_at, zone(r))
    setDate(start.date)
    setTime(start.time)
  }

  // The revised request keeps the flight's length; the departure is the local date and time picked at the airport.
  function revisedTimes(r: ApprovalRow) {
    if (!/^\d\d:\d\d$/.test(time) || !/^\d{4}-\d\d-\d\d$/.test(date)) return null
    const dep = localToIso(date, time, zone(r))
    const length = Date.parse(r.proposed_arr_at) - Date.parse(r.proposed_dep_at)
    return { dep_at: dep, arr_at: new Date(Date.parse(dep) + length).toISOString() }
  }

  async function sendRevision(r: ApprovalRow) {
    const times = revisedTimes(r)
    if (!times) return
    setBusy(true)
    try {
      const res = await fetchWithAuth(`${BASE}/approvals/${r.id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(times),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      const next = (await res.json()) as ApprovalRow
      setRevising(null)
      approvals.reload()
      say(`New request sent for ${r.flight_number} on ${formatServiceDate(r.service_date)}: ${STATUS_LABEL[next.status].toLowerCase()}.`)
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const history = revising
    ? rows
        .filter((r) => r.flight_number === revising.flight_number && r.service_date === revising.service_date)
        .sort((a, b) => a.revision - b.revision)
    : []
  const times = revising ? revisedTimes(revising) : null

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Approvals">
          Every request sent to the simulated approver, with its answer. Pick a time that was offered, or send a revised request. A request
          is not a flight, so search never sees it.
        </PageHeader>
        {!CONNECTED.approvalQueue && <NotConnected>Approval requests are hidden until the /approvals API is connected.</NotConnected>}

        {CONNECTED.approvalQueue && (
          <>
            <Stats
              items={[
                { value: count('pending'), label: 'pending' },
                { value: count('alternative_offered'), label: 'other times offered' },
                { value: count('approved'), label: 'approved' },
                { value: count('rejected'), label: 'rejected' },
              ]}
            />

            <div className="fs-filters">
              <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {(Object.keys(STATUS_LABEL) as ApprovalStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Flight number" value={flight} onChange={(e) => setFlight(e.target.value)}>
                <option value="">All flight numbers</option>
                {[...new Set(rows.map((r) => r.flight_number))].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </SelectField>
            </div>

            <ListState
              loading={approvals.loading}
              error={approvals.error}
              empty={shown.length === 0}
              noun="approval requests"
              emptyText="No requests match these filters."
            />
            {shown.length > 0 && (
              <TableWrap>
                <table className="fs-table fs-t-approvals">
                  <thead>
                    <tr>
                      <th>Flight</th>
                      <th>Service date</th>
                      <th>Purpose</th>
                      <th>Proposed</th>
                      <th>Aircraft</th>
                      <th>Status</th>
                      <th>Answer</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td className="fs-flight">{r.flight_number}</td>
                        <td>{formatServiceDate(r.service_date)}</td>
                        <td>{r.purpose === 'new_flight' ? 'New flight' : 'Reschedule'}</td>
                        <td>{formatDateTime(r.proposed_dep_at, zone(r))}</td>
                        {/* ponytail: the tail number comes from F9; show the start of the id until F9 has an aircraft list. */}
                        <td className="fs-nowrap">{r.aircraft_id.slice(0, 8)}</td>
                        <td>
                          <StatusPill status={TONE[r.status]} label={STATUS_LABEL[r.status]} />
                          <div className="fs-sub">
                            {r.approver_airport} · revision {r.revision}
                          </div>
                        </td>
                        <td>
                          {r.response_note ?? '—'}
                          {r.offers.length > 0 && <div className="fs-sub">Offered: {offerText(r, zone(r))}</div>}
                          {r.covered_by_approval_id && <div className="fs-sub">Covered by an earlier offer</div>}
                        </td>
                        <td>
                          {r.status === 'pending' && (
                            <Link to="/approver-console" className="fs-link">
                              Open console
                            </Link>
                          )}
                          {(r.status === 'alternative_offered' || r.status === 'rejected') && (
                            <button type="button" className="fs-button-light" onClick={() => open(r)}>
                              {r.status === 'alternative_offered' ? 'Pick a time' : 'Revise'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            {revising && (
              <>
                <Card>
                  <h2>
                    Revise {revising.flight_number} · {formatServiceDate(revising.service_date)} ·{' '}
                    {revising.purpose === 'new_flight' ? 'new flight' : 'reschedule'}
                  </h2>
                  <Callout tone="info">
                    <StatusPill status={TONE[revising.status]} label={STATUS_LABEL[revising.status]} />{' '}
                    {revising.response_note ?? 'No note.'}
                    {revising.offers.length > 0 && ` Offered: ${offerText(revising, zone(revising))}.`} Times are local at{' '}
                    {revising.approver_airport}.
                  </Callout>
                  <div className="fs-filters">
                    <FormField label="Departure date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    <FormField label="New departure time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                    <FormField
                      label="Arrival (same flight length)"
                      value={times ? localParts(times.arr_at, zone(revising)).time : '—'}
                      readOnly
                    />
                    <FormField label="Aircraft (unchanged)" value={revising.aircraft_id.slice(0, 8)} readOnly />
                  </div>
                  <div className="fs-form-actions">
                    <button
                      type="button"
                      className="fs-button"
                      disabled={busy || times === null}
                      onClick={() => void sendRevision(revising)}
                    >
                      Request approval for {date} {time || '—'}
                    </button>
                    <button type="button" className="fs-button-ghost" onClick={() => setRevising(null)}>
                      Cancel
                    </button>
                  </div>
                </Card>
                <Card>
                  <h2>
                    Request history · {revising.flight_number} {formatServiceDate(revising.service_date)}
                  </h2>
                  <ul className="fs-events">
                    {history.map((h) => (
                      <li key={h.id}>
                        Revision {h.revision}: {formatDateTime(h.proposed_dep_at, zone(h))} · {STATUS_LABEL[h.status].toLowerCase()}
                        {h.response_note ? ` · ${h.response_note}` : ''}
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </>
        )}
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
