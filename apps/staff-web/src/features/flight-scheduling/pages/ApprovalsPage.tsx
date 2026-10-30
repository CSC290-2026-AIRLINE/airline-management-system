import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Callout } from '../components/Callout'
import { FormField } from '../components/FormField'
import { NotConnected } from '../components/NotConnected'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Stats } from '../components/Stats'
import { TableWrap } from '../components/TableWrap'
import { clockOf, minutesOf } from '../format'
import { useNotice } from '../hooks/useNotice'
import { AIRCRAFT, checkGates as runGateCheck, CONNECTED, reviseApproval } from '../connected'
import type { ApprovalRequest, ApprovalStatus, GateResult } from '../types'
import '../flight-scheduling.css'

const TONE: Record<ApprovalStatus, string> = {
  Approved: 'active',
  'Other times offered': 'delayed',
  Pending: 'departed',
  Rejected: 'cancelled',
}

// Approval requests have no table or API yet, so the page body is hidden (see connected.ts) and its actions refuse.
export function ApprovalsPage() {
  // ponytail: load these from GET /approvals once it exists.
  const [rows, setRows] = useState<ApprovalRequest[]>([])
  const [status, setStatus] = useState('')
  const [flight, setFlight] = useState('')
  const [revising, setRevising] = useState<ApprovalRequest | null>(null)
  const [time, setTime] = useState('')
  const [aircraft, setAircraft] = useState('')
  const [gate, setGate] = useState<GateResult | null>(null)
  const [notice, say] = useNotice()

  const count = (s: ApprovalStatus) => rows.filter((r) => r.status === s).length
  const shown = rows.filter((r) => (status === '' || r.status === status) && (flight === '' || r.flight === flight))

  function act(r: ApprovalRequest) {
    if (r.action === 'Confirm') {
      say('Confirm approved flights on Generate flights.')
    } else if (r.action === 'Pick a slot' || r.action === 'Pick a time' || r.action === 'Revise') {
      setRevising(r)
      setTime(r.proposed)
      setAircraft(r.aircraft)
      setGate(null)
    }
  }

  // Arrival follows from the request's own route block time.
  const arrival = (t: string, blockMin: number) => (/^\d\d:\d\d$/.test(t) ? clockOf(minutesOf(t) + blockMin) : '—')

  async function checkGates() {
    try {
      setGate(await runGateCheck(aircraft))
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    }
  }

  async function sendRevision(r: ApprovalRequest) {
    try {
      const next = await reviseApproval(r.id, { time, aircraft })
      setRows(rows.map((x) => (x.id === r.id ? next : x)))
      setRevising(null)
      say(`New request sent for ${r.flight} on ${r.date}: ${next.status.toLowerCase()}.`)
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Approvals">
          Every request sent to the simulated approver, with its answer. Pick a slot or a time inside an offered window, change the
          aircraft, or request approval for a reschedule. A request is not a flight, so search never sees it.
        </PageHeader>
        {!CONNECTED.approvals && (
          <NotConnected>Approval requests are hidden until the schedule_approval tables and the /approvals API exist.</NotConnected>
        )}

        {CONNECTED.approvals && (
          <>
            <Stats
              items={[
                { value: count('Pending'), label: 'pending' },
                { value: count('Other times offered'), label: 'other times offered' },
                { value: count('Approved'), label: 'approved' },
                { value: count('Rejected'), label: 'rejected' },
              ]}
            />

            <div className="fs-filters">
              <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All live and rejected</option>
                {(Object.keys(TONE) as ApprovalStatus[]).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </SelectField>
              <SelectField label="Flight number" value={flight} onChange={(e) => setFlight(e.target.value)}>
                <option value="">All flight numbers</option>
                {[...new Set(rows.map((r) => r.flight))].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </SelectField>
            </div>

            {shown.length === 0 ? (
              <EmptyState>
                <p>No requests match these filters.</p>
              </EmptyState>
            ) : (
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
                        <td className="fs-flight">{r.flight}</td>
                        <td>{r.date}</td>
                        <td>{r.purpose}</td>
                        <td>{r.proposed}</td>
                        <td className="fs-nowrap">{r.aircraft}</td>
                        <td>
                          <StatusPill status={TONE[r.status]} label={r.status} />
                          <div className="fs-sub">{r.approver}</div>
                        </td>
                        <td>{r.answer}</td>
                        <td>
                          {r.action === 'Open console' ? (
                            <Link to="/approver-console" className="fs-link">
                              Open console
                            </Link>
                          ) : (
                            <button
                              type="button"
                              className={r.action === 'Pick a time' ? 'fs-button fs-button-sm' : 'fs-button-light'}
                              onClick={() => act(r)}
                            >
                              {r.action}
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
                    Revise {revising.flight} · {revising.date} · {revising.purpose.toLowerCase()}
                  </h2>
                  <p className="fs-sub">
                    The {revising.approver.split(' ')[0]} slot coordinator answered: {revising.answer} Pick a time, or change the aircraft.
                  </p>
                  <Callout tone="info">
                    <StatusPill
                      status={TONE[revising.status]}
                      label={revising.status === 'Other times offered' ? 'Time window' : revising.status}
                    />{' '}
                    {revising.answer} · service day {revising.date}
                  </Callout>
                  <div className="fs-filters">
                    <FormField label="New departure time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                    <FormField label="Arrival (from block time)" value={arrival(time, revising.block_time_min)} readOnly />
                    <SelectField
                      label="Aircraft"
                      value={aircraft}
                      onChange={(e) => {
                        setAircraft(e.target.value)
                        setGate(null)
                      }}
                    >
                      {AIRCRAFT.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id === revising.aircraft ? `${a.label} · unchanged` : a.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  {gate && (
                    <Callout tone={gate.passed ? 'good' : 'crit'}>
                      <b>{gate.passed ? 'Gates passed.' : 'A gate failed.'}</b>{' '}
                      {gate.passed ? 'You can send the revised request.' : gate.text}
                    </Callout>
                  )}
                  <div className="fs-form-actions">
                    {gate?.passed ? (
                      <button type="button" className="fs-button" onClick={() => void sendRevision(revising)}>
                        Request approval for {time}
                      </button>
                    ) : (
                      <button type="button" className="fs-button" disabled={time === ''} onClick={() => void checkGates()}>
                        Check gates
                      </button>
                    )}
                    <button type="button" className="fs-button-ghost" onClick={() => setRevising(null)}>
                      Cancel
                    </button>
                  </div>
                </Card>
                <Card>
                  <h2>
                    Request history · {revising.flight} {revising.date}
                  </h2>
                  <ul className="fs-events">
                    {revising.history.map((h) => (
                      <li key={h}>{h}</li>
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
