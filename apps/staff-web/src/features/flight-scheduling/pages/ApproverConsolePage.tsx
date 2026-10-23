import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { SegmentedControl } from '../components/SegmentedControl'
import { Callout } from '../components/Callout'
import { FormField } from '../components/FormField'
import { MockNotice } from '../components/MockNotice'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { Toast } from '../components/Toast'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { TableWrap } from '../components/TableWrap'
import { useNotice } from '../hooks/useNotice'
import { MOCK_REQUESTS, type MockRequest } from '../mocks/network-ops'
import '../flight-scheduling.css'

const ANSWERS = ['Approve', 'Offer slots', 'Offer a window', 'Reject'] as const
type Answer = (typeof ANSWERS)[number]
const REJECT_REASONS = ['capacity_full', 'slot_unavailable', 'curfew', 'other']

// ponytail: MOCK. A team member plays the slot coordinator; the requests are the Figma samples and nothing is sent anywhere.
export function ApproverConsolePage() {
  const [requests, setRequests] = useState<MockRequest[]>(MOCK_REQUESTS)
  const [active, setActive] = useState<MockRequest | null>(null)
  const [answer, setAnswer] = useState<Answer>('Approve')
  const [slots, setSlots] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reject, setReject] = useState('')
  const [notice, say] = useNotice()

  const ready =
    answer === 'Approve' ||
    (answer === 'Offer slots' && slots.trim() !== '') ||
    (answer === 'Offer a window' && from !== '' && to !== '') ||
    (answer === 'Reject' && reject !== '')

  function open(r: MockRequest) {
    setActive(r)
    setAnswer('Approve')
    setSlots('')
    setFrom('')
    setTo('')
    setReject('')
  }

  function send(r: MockRequest) {
    setRequests(requests.filter((x) => x.id !== r.id))
    setActive(null)
    say(`Answer sent for ${r.flight} on ${r.date}: ${answer.toLowerCase()}.`)
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Approver console">
          Shown when approval mode is manual. A team member plays the airport slot coordinator and answers each request, so every case can
          be shown on demand. Nothing connects to a real airport or airline.
        </PageHeader>
        <MockNotice>The requests are simulated until the approval flow exists.</MockNotice>
        <Callout tone="info" action={<Link to="/settings">Open Settings</Link>}>
          Approval mode is manual. In auto mode the system answers by each airport's approval policy after the response delay, through the
          same respond route.
        </Callout>

        {requests.length === 0 ? (
          <EmptyState>
            <p>No requests are waiting for an answer.</p>
          </EmptyState>
        ) : (
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
                    <td>{r.requested}</td>
                    <td className="fs-flight">{r.flight}</td>
                    <td>{r.date}</td>
                    <td>{r.purpose}</td>
                    <td>{r.proposed}</td>
                    <td className="fs-nowrap">{r.aircraft}</td>
                    <td>{r.approver}</td>
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
              Answer {active.flight} on {active.date}
            </h2>
            <SegmentedControl options={ANSWERS} value={answer} onChange={setAnswer} />
            {answer === 'Approve' && <Callout tone="good">The proposed time {active.proposed} is approved as requested.</Callout>}
            {answer === 'Offer slots' && (
              <div className="fs-reason">
                <FormField
                  label="Slots offered (times, separated by commas)"
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
              <button type="button" className="fs-button" disabled={!ready} onClick={() => send(active)}>
                Send answer
              </button>
              <button type="button" className="fs-button-ghost" onClick={() => setActive(null)}>
                Close
              </button>
            </div>
          </Card>
        )}
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
