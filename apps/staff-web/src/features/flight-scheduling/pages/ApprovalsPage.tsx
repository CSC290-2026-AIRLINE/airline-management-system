import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Callout } from '../components/Callout'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { DateField } from '../components/DateField'
import { ListState } from '../components/ListState'
import { NotConnected } from '../components/NotConnected'
import { SelectField } from '../components/SelectField'
import { StatusPill } from '../components/StatusPill'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { offerText, STATUS_LABEL, TONE, answerText } from '../approval-labels'
import { CONNECTED } from '../connected'
import { formatDateTime, formatServiceDate, localParts, localToIso } from '../format'
import { useAircraft } from '../hooks/useAircraft'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import type { AirportRow, ApprovalRow, ApprovalStatus } from '../types'
import '../flight-scheduling.css'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@staff-web/components/ui/table'

// Every request sent to the simulated approver, from GET /approvals. Revising posts a new request (POST /approvals/:id/revise); an
// offered time that an earlier offer already covers is approved at once, otherwise the approver answers again.
export function ApprovalsPage() {
  const { fetchWithAuth } = useAppAuth()
  const { aircraft: fleet } = useAircraft(fetchWithAuth)
  // The tail number (HS-XA1) of an aircraft id, or the start of the id while the fleet is still loading.
  const tailOf = (id: string) => fleet.find((a) => a.id === id)?.label.split(' · ')[0] ?? id.slice(0, 8)
  const approvals = useResource<ApprovalRow[]>(CONNECTED.approvalQueue ? '/approvals?limit=100' : null, fetchWithAuth)
  const airports = usePagedList<AirportRow>('/airports?limit=100', fetchWithAuth)
  const [status, setStatus] = useState('')
  const [flight, setFlight] = useState('')
  const [revising, setRevising] = useState<ApprovalRow | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  // The panel opens under a long table, so bring it into view.
  useEffect(() => {
    if (revising) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [revising])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  const rows = approvals.data ?? []
  const zone = (r: ApprovalRow) => airports.rows.find((a) => a.iata_code === r.approver_airport)?.timezone ?? 'UTC'
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
    <>
      {!CONNECTED.approvalQueue && <NotConnected>Approval requests are hidden until the /approvals API is connected.</NotConnected>}

      {CONNECTED.approvalQueue && (
        <>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flight</TableHead>
                    <TableHead>Service date</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Proposed</TableHead>
                    <TableHead>Aircraft</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Answer</TableHead>
                    <TableHead className="sticky right-0 bg-card"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="fs-flight">{r.flight_number}</TableCell>
                      <TableCell>{formatServiceDate(r.service_date)}</TableCell>
                      <TableCell>{r.purpose === 'new_flight' ? 'New flight' : 'Reschedule'}</TableCell>
                      <TableCell>{formatDateTime(r.proposed_dep_at, zone(r))}</TableCell>
                      <TableCell className="fs-nowrap">{tailOf(r.aircraft_id)}</TableCell>
                      <TableCell>
                        <StatusPill status={TONE[r.status]} label={STATUS_LABEL[r.status]} />
                        <div className="fs-sub">
                          {r.approver_airport} · revision {r.revision}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-56 whitespace-normal">
                        {answerText(r) ?? '—'}
                        {r.offers.length > 0 && <div className="fs-sub">Offered: {offerText(r, zone(r))}</div>}
                        {r.covered_by_approval_id && <div className="fs-sub">Covered by an earlier offer</div>}
                      </TableCell>
                      <TableCell className="sticky right-0 bg-card">
                        {r.status === 'pending' && (
                          <Link to="/schedule-board" search={{ tab: 'console' }} className="fs-link">
                            Open console
                          </Link>
                        )}
                        {(r.status === 'alternative_offered' || r.status === 'rejected') && (
                          <Button variant="outline" size="sm" type="button" onClick={() => open(r)}>
                            {r.status === 'alternative_offered' ? 'Pick a time' : 'Revise'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
          )}
          {revising && (
            <div ref={panel}>
              <Card>
                <h2>
                  Revise {revising.flight_number} · {formatServiceDate(revising.service_date)} ·{' '}
                  {revising.purpose === 'new_flight' ? 'new flight' : 'reschedule'}
                </h2>
                <Callout tone="info">
                  <StatusPill status={TONE[revising.status]} label={STATUS_LABEL[revising.status]} /> {answerText(revising) ?? 'No note.'}
                  {revising.offers.length > 0 && ` Offered: ${offerText(revising, zone(revising))}.`} Times are local at{' '}
                  {revising.approver_airport}.
                </Callout>
                <div className="fs-filters">
                  <DateField label="Departure date" value={date} onChange={(value) => setDate(value)} />
                  <FormField label="New departure time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  <FormField
                    label="Arrival (same flight length)"
                    value={times ? localParts(times.arr_at, zone(revising)).time : '—'}
                    readOnly
                  />
                  <FormField label="Aircraft (unchanged)" value={tailOf(revising.aircraft_id)} readOnly />
                </div>
                <div className="fs-form-actions">
                  <Button type="button" disabled={busy || times === null} onClick={() => void sendRevision(revising)}>
                    Request approval for {date} {time || '—'}
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => setRevising(null)}>
                    Cancel
                  </Button>
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
                      {answerText(h) ? ` · ${answerText(h)}` : ''}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </>
      )}
      <Toast message={notice} />
    </>
  )
}
