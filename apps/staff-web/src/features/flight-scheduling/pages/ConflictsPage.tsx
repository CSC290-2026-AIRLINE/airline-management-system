import { useState } from 'react'
import { SegmentedControl } from '../components/SegmentedControl'
import { Callout } from '../components/Callout'
import { FormField } from '../components/FormField'
import { MockNotice } from '../components/MockNotice'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import { Card } from '../components/Card'
import { Stats } from '../components/Stats'
import { TableWrap } from '../components/TableWrap'
import { EmptyState } from '../components/EmptyState'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { useNotice } from '../hooks/useNotice'
import { MOCK_AIRCRAFT, MOCK_CONFLICTS, mockSlots, type MockConflict } from '../mocks/cross-feature'
import '../flight-scheduling.css'

const MODES = ['Change aircraft', 'Reschedule', 'Cancel and refund', 'Rebook with partner'] as const
type Mode = (typeof MODES)[number]

// ponytail: MOCK. The whole screen is simulated until Person B's conflict checks and resolutions exist; nothing is saved.
export function ConflictsPage() {
  const { reasons } = useDisruptionReasons()
  const [open, setOpen] = useState<MockConflict[]>(MOCK_CONFLICTS)
  const [active, setActive] = useState<MockConflict | null>(null)
  const [mode, setMode] = useState<Mode>('Change aircraft')
  const [reason, setReason] = useState('')
  const [pick, setPick] = useState('')
  const [dismissing, setDismissing] = useState(false)
  const [dismissReason, setDismissReason] = useState('')
  const [notice, say] = useNotice()

  const choose = (c: MockConflict) => {
    setActive(c)
    setMode('Change aircraft')
    setReason('')
    setPick('')
  }

  function apply(c: MockConflict) {
    const needsApproval = mode === 'Reschedule'
    say(
      needsApproval
        ? `Approval requested for ${pick}. The conflict stays open until it is approved.`
        : `${c.flight}: ${mode.toLowerCase()} applied. Conflict resolved.`,
    )
    if (!needsApproval) setOpen((list) => list.filter((x) => x.id !== c.id))
    setActive(null)
  }

  function dismiss(c: MockConflict) {
    setOpen((list) => list.filter((x) => x.id !== c.id))
    setActive(null)
    setDismissing(false)
    setDismissReason('')
    say(`${c.flight} conflict dismissed. An audit entry was sent to feature 15.`)
  }

  const slots = active ? mockSlots(active.departs, active.blockMin) : []
  const ready = reason !== '' && (mode === 'Cancel and refund' || mode === 'Rebook with partner' || pick !== '')

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Conflicts">
          A conflict is a stored record that stays here until staff resolve it or the cause goes away. Choose one of four resolutions; this
          feature records the decision and publishes the event.
        </PageHeader>
        <MockNotice>
          The impact numbers, the aircraft options and the Resolve and Dismiss actions are simulated until Person B's conflict resolutions
          are connected.
        </MockNotice>

        <Stats items={[{ value: open.length, label: <>open {open.length === 1 ? 'conflict' : 'conflicts'}</> }]} />

        {open.length === 0 ? (
          <EmptyState>
            <p>No open conflicts.</p>
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="fs-table fs-t-conflicts">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Flight</th>
                  <th>What failed</th>
                  <th>Detected</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {open.map((c) => (
                  <tr key={c.id} className={active?.id === c.id ? 'fs-row-on' : undefined}>
                    <td>
                      <StatusPill status="cancelled" label={c.kind} />
                    </td>
                    <td>
                      <span className="fs-flight">{c.flight}</span> <span className="fs-to">{c.date}</span>
                    </td>
                    <td>{c.text}</td>
                    <td>{c.detected}</td>
                    <td>
                      <button type="button" className="fs-button fs-button-sm" onClick={() => choose(c)}>
                        Resolve
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
              Resolve {active.flight}: {active.kind}
            </h2>
            <Callout tone="crit">{active.text}</Callout>
            <div className="fs-impact">
              <Stats
                items={[
                  { value: active.impact.bookings, label: 'bookings (3b)' },
                  { value: active.impact.crew, label: 'crew (8)' },
                  { value: active.impact.bags, label: 'bags (10)' },
                  { value: active.impact.cargo, label: 'cargo bookings (17)' },
                ]}
              />
              <p className="fs-sub">
                Impact preview. Example numbers; the real ones come from those features (GET /flights/{'{id}'}/impact).
              </p>
            </div>

            <SegmentedControl
              options={MODES}
              value={mode}
              onChange={(m) => {
                setMode(m)
                setPick('')
              }}
            />

            <div className="fs-reason">
              <SelectField label="Disruption reason (required)" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a disruption reason</option>
                {reasons.map((r) => (
                  <option key={r.code} value={r.label}>
                    {r.label}
                  </option>
                ))}
              </SelectField>
            </div>

            {mode === 'Change aircraft' && (
              <div className="fs-options">
                {MOCK_AIRCRAFT.filter((a) => a.id !== 'HS-AB1').map((a) => (
                  <label key={a.id} className={`fs-option${a.usable ? '' : ' fs-option-off'}${pick === a.id ? ' fs-pattern-on' : ''}`}>
                    <input type="radio" name="aircraft" disabled={!a.usable} checked={pick === a.id} onChange={() => setPick(a.id)} />
                    <span>
                      <b>{a.id}</b> <span className="fs-to">· {a.label.split(' · ').slice(1).join(' · ')}</span>{' '}
                      {a.usable && <StatusPill status="ok" label="free for this flight" />}
                      <span className={a.usable ? 'fs-sub' : 'fs-sub fs-sub-crit'}>
                        {a.usable
                          ? 'Same type as HS-AB1, so passengers keep their seats.'
                          : `${a.id} is in maintenance until Tue 6 Oct 23:59 (feature 9).`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {mode === 'Reschedule' && (
              <>
                <p className="fs-sub">
                  Choose a new departure time. Arrival follows from the {active.blockMin} minute block time. Each option passes the
                  aircraft, position, turnaround and congestion checks; the chosen time then goes to the simulated slot coordinator for
                  approval.
                </p>
                <div className="fs-options">
                  {slots.map((s) => (
                    <label key={s.depart} className={`fs-option${pick === s.depart ? ' fs-pattern-on' : ''}`}>
                      <input type="radio" name="slot" checked={pick === s.depart} onChange={() => setPick(s.depart)} />
                      <span>
                        <b>Depart {s.depart}</b> <span className="fs-to">· arrive {s.arrive}</span>{' '}
                        <StatusPill status="delayed" label={`+${s.extra} min`} />
                      </span>
                    </label>
                  ))}
                </div>
                {pick && (
                  <Callout tone="info">
                    <b>Needs approval.</b> The flight moves, and flight.rescheduled is published, only when the approver approves {pick};
                    the conflict stays open until then.
                  </Callout>
                )}
              </>
            )}

            {(mode === 'Cancel and refund' || mode === 'Rebook with partner') && (
              <Callout tone="info">
                {mode === 'Cancel and refund'
                  ? 'The flight is cancelled and feature 5b refunds the passengers. This feature only records the cancellation.'
                  : 'The flight is cancelled and feature 3b rebooks the passengers on a partner airline. This feature only records the decision.'}
              </Callout>
            )}

            <div className="fs-form-actions fs-between">
              <span className="fs-form-actions">
                <button type="button" className="fs-button" disabled={!ready} onClick={() => apply(active)}>
                  {mode === 'Reschedule' ? 'Request approval and apply' : 'Apply resolution'}
                </button>
                <button type="button" className="fs-button-ghost" onClick={() => setActive(null)}>
                  Close
                </button>
              </span>
              <button type="button" className="fs-button-danger" onClick={() => setDismissing(true)}>
                Dismiss with a reason…
              </button>
            </div>
            <p className="fs-sub fs-mt">
              Dismiss closes the conflict without a resolution. It needs a reason and sends an audit entry to feature 15.
            </p>
          </Card>
        )}

        {dismissing && active && (
          <div className="fs-modal-backdrop" role="presentation">
            <div className="fs-modal" role="dialog" aria-modal="true" aria-labelledby="dismiss-title">
              <h2 id="dismiss-title">Dismiss this conflict?</h2>
              <p className="fs-sub">
                {active.flight} · {active.kind}. The conflict closes without a resolution and no event is published for the flight.
              </p>
              <FormField
                label="Reason (required, sent to the audit log)"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
              />
              <p className="fs-sub fs-mt">An audit entry with this reason goes to feature 15. A later delay can raise a new conflict.</p>
              <div className="fs-form-actions fs-end">
                <button type="button" className="fs-button-ghost" onClick={() => setDismissing(false)}>
                  Cancel
                </button>
                <button type="button" className="fs-button-danger" disabled={dismissReason.trim() === ''} onClick={() => dismiss(active)}>
                  Dismiss conflict
                </button>
              </div>
            </div>
          </div>
        )}
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
