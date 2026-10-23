import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { useState } from 'react'
import { Callout } from '../components/Callout'
import { Card } from '../components/Card'
import { AIRCRAFT, CONNECTED, partnersFor, requestReschedule } from '../connected'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { PageHeader } from '../components/PageHeader'
import { SegmentedControl } from '../components/SegmentedControl'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { Stats } from '../components/Stats'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { capitalize, formatDateTime } from '../format'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import type { ConflictOptions, ConflictRow, FlightImpact, Resolution } from '../types'
import '../flight-scheduling.css'

const MODES = ['Change aircraft', 'Reschedule', 'Cancel and refund', 'Rebook with partner'] as const
type Mode = (typeof MODES)[number]
const RESOLUTION: Record<Mode, Resolution> = {
  'Change aircraft': 'change_aircraft',
  Reschedule: 'reschedule',
  'Cancel and refund': 'cancel_refund',
  'Rebook with partner': 'rebook_partner',
}

const kindLabel = (kind: string) => capitalize(kind.replace(/_/g, ' '))
const utc = (iso: string) => `${formatDateTime(iso, 'UTC')} UTC`

// Open conflicts from GET /conflicts. Which resolutions can be applied comes from GET /conflicts/:id/options: one the backend cannot
// apply yet (it needs feature 9, the approval tables or partner routes) shows the reason instead of a form.
export function ConflictsPage() {
  const { fetchWithAuth } = useAppAuth()
  const { reasons } = useDisruptionReasons()
  const conflicts = useResource<ConflictRow[]>('/conflicts', fetchWithAuth)
  const [activeId, setActiveId] = useState<string | null>(null)
  const options = useResource<ConflictOptions>(activeId && `/conflicts/${activeId}/options`, fetchWithAuth)
  const [mode, setMode] = useState<Mode>('Cancel and refund')
  const [reason, setReason] = useState('')
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const [dismissReason, setDismissReason] = useState('')
  const [notice, say] = useNotice()

  const open = conflicts.data ?? []
  const active = open.find((c) => c.id === activeId) ?? null
  const option = options.data?.options.find((o) => o.resolution === RESOLUTION[mode])
  const available = option?.available === true
  const impact = useResource<FlightImpact>(CONNECTED.impact && active ? `/flights/${active.flight_id}/impact` : null, fetchWithAuth)
  // ponytail: later departures that clear the conflict; GET /flights/:id/availability will supply them.
  const slots: { extra: number; depart: string; arrive: string }[] = []
  const partners = active ? partnersFor(active.flight.route.origin, active.flight.route.destination) : []
  const ready = available && reason !== '' && (mode === 'Cancel and refund' || pick !== '')

  const choose = (c: ConflictRow) => {
    setActiveId(c.id)
    setMode('Cancel and refund')
    setReason('')
    setPick('')
    setError(null)
  }

  async function post(path: string, body: object) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithAuth(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) return true
      setError(await errorMessage(res))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
    return false
  }

  async function apply(c: ConflictRow) {
    if (mode === 'Reschedule') {
      // A reschedule needs an approved request first; the conflict stays open until then.
      try {
        await requestReschedule(c.flight_id, pick)
        say(`Approval requested for ${pick}. The conflict stays open until it is approved.`)
        setActiveId(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      return
    }
    const body =
      mode === 'Change aircraft'
        ? { resolution: 'change_aircraft', aircraft_id: pick }
        : mode === 'Rebook with partner'
          ? { resolution: 'rebook_partner', reason_code: reason, partner_airline: pick }
          : { resolution: 'cancel_refund', reason_code: reason }
    if (!(await post(`/conflicts/${c.id}/resolve`, body))) return
    say(`${c.flight.flight_number}: ${mode.toLowerCase()} applied. Conflict resolved.`)
    setActiveId(null)
    conflicts.reload()
  }

  async function dismiss(c: ConflictRow) {
    const ok = await post(`/conflicts/${c.id}/dismiss`, { reason: dismissReason.trim() })
    setDismissing(false)
    if (!ok) return
    setDismissReason('')
    say(`${c.flight.flight_number} conflict dismissed.`)
    setActiveId(null)
    conflicts.reload()
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Conflicts">
          A conflict is a stored record that stays here until staff resolve it or the cause goes away. Choose one of four resolutions; this
          feature records the decision and publishes the event.
        </PageHeader>

        <Stats items={[{ value: open.length, label: <>open {open.length === 1 ? 'conflict' : 'conflicts'}</> }]} />

        <ListState
          loading={conflicts.loading}
          error={conflicts.error}
          empty={open.length === 0}
          noun="conflicts"
          emptyText="No open conflicts."
        />

        {open.length > 0 && (
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
                  <tr key={c.id} className={activeId === c.id ? 'fs-row-on' : undefined}>
                    <td>
                      <StatusPill status="cancelled" label={kindLabel(c.kind)} />
                    </td>
                    <td>
                      <span className="fs-flight">{c.flight.flight_number}</span>{' '}
                      <span className="fs-to">
                        {c.flight.route.origin} to {c.flight.route.destination} · departs {utc(c.flight.dep_at)}
                      </span>
                    </td>
                    <td>{c.detail}</td>
                    <td>{utc(c.detected_at)}</td>
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
              Resolve {active.flight.flight_number}: {kindLabel(active.kind)}
            </h2>
            <Callout tone="crit">{active.detail}</Callout>
            {impact.data && (
              <div className="fs-impact">
                <Stats
                  items={[
                    { value: impact.data.bookings, label: 'bookings (3b)' },
                    { value: impact.data.crew, label: 'crew (8)' },
                    { value: impact.data.bags, label: 'bags (10)' },
                    { value: impact.data.cargo, label: 'cargo bookings (17)' },
                  ]}
                />
                <p className="fs-sub">Impact preview from those features (GET /flights/{'{id}'}/impact).</p>
              </div>
            )}

            <SegmentedControl
              options={MODES}
              value={mode}
              onChange={(m) => {
                setMode(m)
                setPick('')
              }}
            />

            {options.error && <p role="alert">Could not load the options: {options.error}</p>}
            {options.loading && <p>Loading options…</p>}
            {option && !option.available && (
              <Callout tone="warn">{option.blocked_by ?? `${mode} is not available for this conflict.`}</Callout>
            )}

            {available && (
              <div className="fs-reason">
                <SelectField label="Disruption reason (required)" value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose a disruption reason</option>
                  {reasons.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}

            {available && mode === 'Change aircraft' && (
              <div className="fs-options">
                {AIRCRAFT.map((a) => (
                  <label key={a.id} className={`fs-option${a.usable ? '' : ' fs-option-off'}${pick === a.id ? ' fs-pattern-on' : ''}`}>
                    <input type="radio" name="aircraft" disabled={!a.usable} checked={pick === a.id} onChange={() => setPick(a.id)} />
                    <span>
                      <b>{a.label.split(' · ')[0]}</b> <span className="fs-to">· {a.label.split(' · ').slice(1).join(' · ')}</span>{' '}
                      {a.usable && <StatusPill status="ok" label="free for this flight" />}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {available && mode === 'Reschedule' && (
              <>
                <p className="fs-sub">
                  Choose a new departure time. Each option passes the aircraft, position, turnaround and congestion checks; the chosen time
                  then goes to the simulated slot coordinator for approval.
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

            {available && mode === 'Rebook with partner' && (
              <div className="fs-reason">
                <SelectField label="Partner airline" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Choose a partner airline</option>
                  {partners.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </SelectField>
              </div>
            )}

            {available && (mode === 'Cancel and refund' || mode === 'Rebook with partner') && (
              <Callout tone="info">
                {mode === 'Cancel and refund'
                  ? 'The flight is cancelled and feature 5b refunds the passengers. This feature only records the cancellation.'
                  : 'The flight is cancelled and feature 3b rebooks the passengers on a partner airline. This feature only records the decision.'}
              </Callout>
            )}

            {error && !dismissing && <p role="alert">{error}</p>}

            <div className="fs-form-actions fs-between">
              <span className="fs-form-actions">
                <button type="button" className="fs-button" disabled={!ready || busy} onClick={() => void apply(active)}>
                  {busy ? 'Applying…' : mode === 'Reschedule' ? 'Request approval and apply' : 'Apply resolution'}
                </button>
                <button type="button" className="fs-button-ghost" onClick={() => setActiveId(null)}>
                  Close
                </button>
              </span>
              <button type="button" className="fs-button-danger" onClick={() => setDismissing(true)}>
                Dismiss with a reason…
              </button>
            </div>
            <p className="fs-sub fs-mt">
              Dismiss closes the conflict without a resolution. It needs a reason and an audit entry in feature 15; until feature 15 is
              connected the server refuses it and the conflict stays open.
            </p>
          </Card>
        )}

        {dismissing && active && (
          <div className="fs-modal-backdrop" role="presentation">
            <div className="fs-modal" role="dialog" aria-modal="true" aria-labelledby="dismiss-title">
              <h2 id="dismiss-title">Dismiss this conflict?</h2>
              <p className="fs-sub">
                {active.flight.flight_number} · {kindLabel(active.kind)}. The conflict closes without a resolution and no event is published
                for the flight.
              </p>
              <FormField
                label="Reason (required, sent to the audit log)"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
              />
              <div className="fs-form-actions fs-end">
                <button type="button" className="fs-button-ghost" onClick={() => setDismissing(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="fs-button-danger"
                  disabled={dismissReason.trim() === '' || busy}
                  onClick={() => void dismiss(active)}
                >
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
