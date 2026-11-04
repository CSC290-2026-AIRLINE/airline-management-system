import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Callout } from '../components/Callout'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { NotConnected } from '../components/NotConnected'
import { PageHeader } from '../components/PageHeader'
import { SegmentedControl } from '../components/SegmentedControl'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { CONNECTED } from '../connected'
import { formatDateTime, formatServiceDate, localParts, localToIso } from '../format'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import type { AirportRow, ApprovalRow } from '../types'
import '../flight-scheduling.css'

const ANSWERS = ['Approve', 'Offer slots', 'Offer a window', 'Reject'] as const
type Answer = (typeof ANSWERS)[number]
// The reasons the backend accepts (schedule_approval.reject_reason).
const REJECT_REASONS = ['curfew', 'capacity_full', 'no_slot_available', 'other']
const TIME = /^\d\d:\d\d$/

// A team member plays the slot coordinator. Requests come from GET /approvals?status=pending and each answer is POST /approvals/:id/respond.
// Times typed here are local at the request's airport, on the date of the requested departure.
export function ApproverConsolePage() {
  const { fetchWithAuth } = useAppAuth()
  const pending = useResource<ApprovalRow[]>(CONNECTED.approvalQueue ? '/approvals?status=pending&limit=100' : null, fetchWithAuth)
  const airports = usePagedList<AirportRow>('/airports?limit=100', fetchWithAuth)
  const [active, setActive] = useState<ApprovalRow | null>(null)
  const [answer, setAnswer] = useState<Answer>('Approve')
  const [slots, setSlots] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reject, setReject] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  const requests = pending.data ?? []
  const zone = (r: ApprovalRow) => airports.rows.find((a) => a.iata_code === r.approver_airport)?.timezone ?? 'UTC'
  const slotTimes = slots
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const ready =
    answer === 'Approve' ||
    (answer === 'Offer slots' && slotTimes.length > 0 && slotTimes.every((t) => TIME.test(t))) ||
    (answer === 'Offer a window' && TIME.test(from) && TIME.test(to) && to > from) ||
    (answer === 'Reject' && reject !== '')

  function open(r: ApprovalRow) {
    setActive(r)
    setAnswer('Approve')
    setSlots('')
    setFrom('')
    setTo('')
    setReject('')
  }

  function body(r: ApprovalRow) {
    const date = localParts(r.proposed_dep_at, zone(r)).date
    const instant = (t: string) => localToIso(date, t, zone(r))
    if (answer === 'Approve') return { answer: 'approve' }
    if (answer === 'Reject') return { answer: 'reject', reject_reason: reject }
    if (answer === 'Offer slots') return { answer: 'offer', offers: slotTimes.map((t) => ({ starts_at: instant(t) })) }
    return { answer: 'offer', offers: [{ starts_at: instant(from), ends_at: instant(to) }] }
  }

  async function send(r: ApprovalRow) {
    setBusy(true)
    try {
      const res = await fetchWithAuth(`${BASE}/approvals/${r.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body(r)),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      setActive(null)
      pending.reload()
      say(`Answer sent for ${r.flight_number} on ${formatServiceDate(r.service_date)}: ${answer.toLowerCase()}.`)
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Approver console">
          Shown when approval mode is manual. A team member plays the airport slot coordinator and answers each request, so every case can
          be shown on demand. Nothing connects to a real airport or airline.
        </PageHeader>
        {!CONNECTED.approvalQueue && <NotConnected>The console is hidden until the /approvals API is connected.</NotConnected>}

        {CONNECTED.approvalQueue && (
          <>
            <Callout tone="info" action={<Link to="/settings">Open Settings</Link>}>
              In manual mode requests wait here for an answer. In auto mode the system answers by each airport's approval policy, so
              requests only show here while approval mode is manual or a response delay is set.
            </Callout>

            <ListState
              loading={pending.loading}
              error={pending.error}
              empty={requests.length === 0}
              noun="requests"
              emptyText="No requests are waiting for an answer."
            />
            {requests.length > 0 && (
              <TableWrap>
                <table className="fs-table fs-t-requests">
                  <thead>
                    <tr>
                      <th data-short="Requested">Requested (simulation)</th>
                      <th>Flight</th>
                      <th>Service date</th>
                      <th>Purpose</th>
                      <th>Proposed</th>
                      <th>Aircraft</th>
                      <th>Approver</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className={active?.id === r.id ? 'fs-row-on' : undefined}>
                        <td>{formatDateTime(r.requested_at, 'UTC')} UTC</td>
                        <td className="fs-flight">{r.flight_number}</td>
                        <td>{formatServiceDate(r.service_date)}</td>
                        <td>{r.purpose === 'new_flight' ? 'New flight' : 'Reschedule'}</td>
                        <td>{formatDateTime(r.proposed_dep_at, zone(r))}</td>
                        {/* ponytail: the tail number comes from F9; show the start of the id until F9 has an aircraft list. */}
                        <td className="fs-nowrap">{r.aircraft_id.slice(0, 8)}</td>
                        <td>{r.approver_airport}</td>
                        <td>
                          <button type="button" className="fs-button-light" onClick={() => open(r)}>
                            Answer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}

            {active && (
              <Card>
                <h2>
                  Answer {active.flight_number} on {formatServiceDate(active.service_date)}
                </h2>
                <SegmentedControl options={ANSWERS} value={answer} onChange={setAnswer} />
                {answer === 'Approve' && (
                  <Callout tone="good">
                    The proposed time {localParts(active.proposed_dep_at, zone(active)).time} is approved as requested.
                  </Callout>
                )}
                {answer === 'Offer slots' && (
                  <div className="fs-reason">
                    <FormField
                      label={`Slots offered (local times at ${active.approver_airport}, separated by commas)`}
                      value={slots}
                      placeholder="10:00, 10:30, 11:00"
                      onChange={(e) => setSlots(e.target.value)}
                    />
                  </div>
                )}
                {answer === 'Offer a window' && (
                  <div className="fs-filters">
                    <FormField label="Window from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
                    <FormField label="Window to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                )}
                {answer === 'Reject' && (
                  <div className="fs-reason">
                    <SelectField label="Reason" value={reject} onChange={(e) => setReject(e.target.value)}>
                      <option value="">Choose a reason</option>
                      {REJECT_REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </SelectField>
                  </div>
                )}
                <div className="fs-form-actions">
                  <button type="button" className="fs-button" disabled={!ready || busy} onClick={() => void send(active)}>
                    Send answer
                  </button>
                  <button type="button" className="fs-button-ghost" onClick={() => setActive(null)}>
                    Close
                  </button>
                </div>
              </Card>
            )}
          </>
        )}
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
