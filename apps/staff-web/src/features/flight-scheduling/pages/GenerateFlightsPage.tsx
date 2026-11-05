import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Callout } from '../components/Callout'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import { Card } from '../components/Card'
import { TableWrap } from '../components/TableWrap'
import { clockOf, formatServiceDate, localParts, localToIso } from '../format'
import {
  approvalBody,
  approvalOutcome,
  checkOutcome,
  chunks,
  confirmBody,
  confirmOutcome,
  gateCheckBody,
  moveTo,
  type ConfirmResult,
  type GateCheckResult,
  type PlanFlight,
} from '../generate-flights'
import { useAircraft } from '../hooks/useAircraft'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import { CONNECTED } from '../connected'
import type { AirportRow, Approval, ApprovalRow, RouteRow, TimetableRow } from '../types'
import '../flight-scheduling.css'

interface PlannedFlight {
  service_date: string
  flight_number: string
  scheduled_dep_at: string
  scheduled_arr_at: string
  departure_local: string // 2026-10-04T07:00, origin time
  arrival_local: string // destination time
  overnight: boolean
  already_exists: boolean
  warnings: string[]
}

// POST /schedule-builder/preview for one timetable (real).
interface Preview {
  timetable_id: string
  flight_number: string
  route: { id: string; origin: string; destination: string }
  period: { from: string; to: string }
  summary: { total: number; new: number; already_exists: number }
  warnings: string[]
  flights: PlannedFlight[]
}

// One line of the unsaved preview. Its aircraft, gate check, approval and confirm are the real POST /flights/check, POST /approvals,
// POST /approvals/:id/revise and POST /flights/confirm.
interface Row {
  key: string
  flight: string
  date: string // YYYY-MM-DD
  origin: string
  destination: string
  departs: string
  arrives: string
  overnight: boolean
  skipped: boolean
  note: string
  aircraft: string
  routeId: string
  patternId: string | null
  depAt: string // UTC instants, what the API takes
  arrAt: string
  approvalId: string | null
  check: 'none' | 'passed' | 'failed'
  checkText: string
  approval: Approval
  answer: string
  slots: string[] // departures the approver offered
}

const time = (local: string) => local.slice(11, 16)
const APPROVAL_PILL: Record<Approval, { status: string; label: string }> = {
  none: { status: 'scheduled', label: 'Not requested' },
  not_requested: { status: 'scheduled', label: 'Not requested' },
  pending: { status: 'departed', label: 'Pending' },
  approved: { status: 'active', label: 'Approved' },
  offered: { status: 'delayed', label: 'Other times offered' },
  rejected: { status: 'cancelled', label: 'Rejected' },
}

export function GenerateFlightsPage({ pattern }: { pattern?: string }) {
  const { fetchWithAuth } = useAppAuth()
  // ponytail: first 100 of each; page through them when there are more.
  const timetables = usePagedList<TimetableRow>('/timetables?limit=100', fetchWithAuth)
  const routes = usePagedList<RouteRow>('/routes?is_active=true&limit=100', fetchWithAuth)
  const routeById = new Map(routes.rows.map((r) => [r.id, r]))
  const airports = usePagedList<AirportRow>('/airports?limit=100', fetchWithAuth)
  const { aircraft: fleet } = useAircraft(fetchWithAuth)
  const zoneOf = (code: string) => airports.rows.find((a) => a.iata_code === code)?.timezone ?? 'UTC'

  const [selected, setSelected] = useState<Set<string>>(new Set(pattern ? [pattern] : []))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Preview[] | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const [assignTo, setAssignTo] = useState('')
  const [confirmed, setConfirmed] = useState<Row[] | null>(null)
  const [oneOff, setOneOff] = useState<{ route_id: string; flight: string; date: string; time: string } | null>(null)
  const [notice, say] = useNotice()

  function toggle(id: string) {
    const next = new Set(selected)
    if (!next.delete(id)) next.add(id)
    setSelected(next)
  }

  async function preview(id: string): Promise<Preview> {
    const res = await fetchWithAuth(`${BASE}/schedule-builder/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timetable_id: id, ...(from && { from }), ...(to && { to }) }),
    })
    if (!res.ok) throw new Error(await errorMessage(res))
    return (await res.json()) as Preview
  }

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const result = await Promise.all([...selected].map(preview))
      setPreviews(result)
      setPicked(new Set())
      setConfirmed(null)
      setRows(
        result
          .flatMap((p) =>
            p.flights.map<Row>((f) => ({
              key: `${f.flight_number}-${f.service_date}`,
              flight: f.flight_number,
              date: f.service_date,
              origin: p.route.origin,
              destination: p.route.destination,
              departs: time(f.departure_local),
              arrives: time(f.arrival_local),
              overnight: f.overnight,
              skipped: f.already_exists,
              note: f.warnings.join('; '),
              aircraft: '',
              routeId: p.route.id,
              patternId: p.timetable_id,
              depAt: f.scheduled_dep_at,
              arrAt: f.scheduled_arr_at,
              approvalId: null,
              check: 'none',
              checkText: '',
              approval: 'none',
              answer: '',
              slots: [],
            })),
          )
          .sort((a, b) => a.date.localeCompare(b.date) || a.departs.localeCompare(b.departs)),
      )
    } catch (e) {
      setPreviews(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const update = (keys: Set<string>, change: (r: Row) => Partial<Row>) =>
    setRows((all) => all.map((r) => (keys.has(r.key) ? { ...r, ...change(r) } : r)))
  const chosen = rows.filter((r) => picked.has(r.key))
  const togglePicked = (key: string) => {
    const next = new Set(picked)
    if (!next.delete(key)) next.add(key)
    setPicked(next)
  }
  const selectable = rows.filter((r) => !r.skipped)

  const planOf = (r: Row): PlanFlight => ({
    routeId: r.routeId,
    patternId: r.patternId,
    flight: r.flight,
    date: r.date,
    aircraft: r.aircraft,
    depAt: r.depAt,
    arrAt: r.arrAt,
  })

  // Posts JSON to the flight-scheduling API and returns the parsed body, or throws the API's own message.
  async function post<T>(path: string, body: object): Promise<T> {
    const res = await fetchWithAuth(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await errorMessage(res))
    return (await res.json()) as T
  }

  // The gates of each flight with an aircraft, in calls of at most 50. The answer names the exact rule a flight breaks.
  async function checkGates() {
    const without = chosen.filter((r) => !r.aircraft)
    update(new Set(without.map((r) => r.key)), () => ({ check: 'none', checkText: 'Assign an aircraft first' }))
    try {
      for (const group of chunks(chosen.filter((r) => r.aircraft))) {
        const { results } = await post<{ results: GateCheckResult[] }>('/flights/check', gateCheckBody(group.map(planOf)))
        for (const result of results) {
          const outcome = checkOutcome(result)
          update(new Set([group[result.index].key]), () => ({
            check: outcome.check,
            checkText: outcome.text,
            approval: outcome.check === 'passed' ? 'not_requested' : 'none',
            approvalId: null,
            answer: '',
            slots: [],
          }))
        }
      }
      say('Gates checked.')
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    }
  }

  // One request per flight that passed its gates; the simulated approver of the origin airport answers each.
  async function requestApproval() {
    const ready = chosen.filter((r) => r.check === 'passed')
    const answers: Approval[] = []
    for (const r of ready) {
      try {
        const a = await post<ApprovalRow>('/approvals', approvalBody(planOf(r)))
        const outcome = approvalOutcome(a, zoneOf(r.origin))
        answers.push(outcome.approval)
        update(new Set([r.key]), () => ({ ...outcome, approvalId: a.id }))
      } catch (e) {
        answers.push('none')
        update(new Set([r.key]), () => ({
          approval: 'none',
          approvalId: null,
          answer: '',
          check: 'failed',
          checkText: e instanceof Error ? e.message : String(e),
        }))
      }
    }
    const count = (a: Approval) => answers.filter((x) => x === a).length
    say(
      `${ready.length} requests sent: ${count('approved')} approved, ${count('offered')} other times offered, ${count('pending')} pending, ${count('rejected')} rejected.`,
    )
  }

  // An offered time is a revision of the request: the approver already offered it, so it is approved at once.
  async function pickSlot(r: Row, slot: string) {
    if (!r.approvalId) return
    const zone = zoneOf(r.origin)
    const moved = moveTo(r, slot, zone)
    try {
      const a = await post<ApprovalRow>(`/approvals/${r.approvalId}/revise`, { dep_at: moved.depAt, arr_at: moved.arrAt })
      update(new Set([r.key]), () => ({
        ...moved,
        ...approvalOutcome(a, zone),
        approvalId: a.id,
        departs: localParts(moved.depAt, zone).time,
        arrives: localParts(moved.arrAt, zoneOf(r.destination)).time,
      }))
      say(`${r.flight} on ${r.date} moved to ${slot}: ${approvalOutcome(a, zone).approval}.`)
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    }
  }

  // Saves the approved flights, in calls of at most 50. A flight that fails stays in the table with the reason.
  async function confirmApproved() {
    const ok = chosen.filter((r) => r.approval === 'approved' && r.approvalId)
    const saved: Row[] = []
    try {
      for (const group of chunks(ok)) {
        const { results } = await post<{ results: ConfirmResult[] }>(
          '/flights/confirm',
          confirmBody(group.map((r) => ({ ...planOf(r), approvalId: r.approvalId as string }))),
        )
        for (const result of results) {
          const row = group[result.index]
          const outcome = confirmOutcome(result)
          if (outcome.saved) saved.push(row)
          else
            update(new Set([row.key]), () => ({
              check: 'failed',
              checkText: outcome.text,
              approval: 'none',
              approvalId: null,
              answer: '',
              slots: [],
            }))
        }
      }
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    }
    if (saved.length > 0) {
      setConfirmed((done) => [...(done ?? []), ...saved])
      setRows((all) => all.filter((r) => !saved.some((o) => o.key === r.key)))
      setPicked(new Set())
    }
    say(`${saved.length} of ${ok.length} flights confirmed.`)
  }

  function assign() {
    update(picked, () => ({ aircraft: assignTo, check: 'none', checkText: '', approval: 'none', approvalId: null, answer: '', slots: [] }))
    setAssigning(false)
  }

  function discard(keys: Set<string>) {
    setRows((all) => all.filter((r) => !keys.has(r.key)))
    setPicked(new Set())
  }

  function addOneOff() {
    if (!oneOff) return
    const route = routeById.get(oneOff.route_id)
    if (!route) return
    const [h, m] = oneOff.time.split(':').map(Number)
    const arr = h * 60 + m + route.block_time_min
    // The time is local at the origin, which is also where the service date counts.
    const depAt = localToIso(oneOff.date, oneOff.time, zoneOf(route.origin))
    const row: Row = {
      key: `${oneOff.flight}-${oneOff.date}`,
      flight: oneOff.flight.toUpperCase(),
      date: oneOff.date,
      origin: route.origin,
      destination: route.destination,
      departs: oneOff.time,
      arrives: clockOf(arr),
      overnight: arr >= 24 * 60,
      skipped: false,
      note: 'one-off flight',
      aircraft: '',
      routeId: route.id,
      patternId: null,
      depAt,
      arrAt: new Date(Date.parse(depAt) + route.block_time_min * 60000).toISOString(),
      approvalId: null,
      check: 'none',
      checkText: '',
      approval: 'none',
      answer: '',
      slots: [],
    }
    setRows((all) => [...all.filter((r) => r.key !== row.key), row])
    setPreviews((p) => p ?? [])
    setOneOff(null)
  }

  const names = (previews ?? []).map((p) => p.flight_number).join(' and ')
  const periodFrom = (previews ?? []).map((p) => p.period.from).sort()[0]
  const periodTo = (previews ?? [])
    .map((p) => p.period.to)
    .sort()
    .at(-1)
  const skipped = rows.filter((r) => r.skipped).length
  const warnings = (previews ?? []).flatMap((p) => p.warnings)
  const failedGates = rows.filter((r) => r.check === 'failed').length
  const approvedCount = chosen.filter((r) => r.approval === 'approved').length
  const passedCount = chosen.filter((r) => r.check === 'passed').length

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader
          title="Generate flights"
          action={
            <Link to="/schedule-board" className="fs-button-light fs-button-lg">
              Back to Schedule board
            </Link>
          }
        >
          Flights are previewed here and saved only when they pass the checks, hold an approval and you confirm them. Leave without
          confirming and the preview is lost; approval requests stay on the Approvals page.
        </PageHeader>

        <Card first>
          <h2>Choose patterns and dates</h2>
          <p className="fs-sub">
            Pick one or more patterns and a date range, or add a one-off flight. Nothing is saved until you confirm: assign aircraft, check,
            request approval, then confirm the approved flights. Existing flights are never overwritten; those dates are reported as
            skipped.
          </p>

          <p className="fs-field-label">Patterns (tick one or more)</p>
          <ListState
            loading={timetables.loading}
            error={timetables.error}
            empty={timetables.rows.length === 0}
            noun="patterns"
            emptyText="No patterns yet. Create a pattern first."
          />
          <div className="fs-patterns">
            {timetables.rows.map((t) => {
              const route = routeById.get(t.route_id)
              return (
                <label key={t.id} className={`fs-pattern${selected.has(t.id) ? ' fs-pattern-on' : ''}`}>
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                  {t.flight_number}
                  {route && ` · ${route.origin} to ${route.destination}`} · {t.dep_time_local}
                </label>
              )
            })}
            <button
              type="button"
              className="fs-button-light fs-button-lg"
              onClick={() => setOneOff({ route_id: '', flight: '', date: '', time: '' })}
            >
              + Add a one-off flight
            </button>
          </div>
          <p className="fs-sub">
            Editing opens the Patterns page. An unconfirmed preview is discarded when you leave. <Link to="/patterns">Manage patterns</Link>
          </p>

          {oneOff && (
            <div className="fs-oneoff">
              <h3>One-off flight</h3>
              <div className="fs-form-grid">
                <SelectField label="Route" value={oneOff.route_id} onChange={(e) => setOneOff({ ...oneOff, route_id: e.target.value })}>
                  <option value="">Choose a route</option>
                  {routes.rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.origin} to {r.destination}
                    </option>
                  ))}
                </SelectField>
                <FormField
                  label="Flight number"
                  value={oneOff.flight}
                  placeholder="XX901"
                  onChange={(e) => setOneOff({ ...oneOff, flight: e.target.value })}
                />
                <FormField
                  label="Departure date"
                  type="date"
                  value={oneOff.date}
                  onChange={(e) => setOneOff({ ...oneOff, date: e.target.value })}
                />
                <FormField
                  label="Departure time (local)"
                  type="time"
                  value={oneOff.time}
                  onChange={(e) => setOneOff({ ...oneOff, time: e.target.value })}
                />
              </div>
              <p className="fs-sub">
                A one-off flight goes through the same checks, approval and confirm as pattern flights. It has no pattern.
              </p>
              <div className="fs-form-actions">
                <button
                  type="button"
                  className="fs-button"
                  disabled={!oneOff.route_id || !oneOff.flight || !oneOff.date || !oneOff.time}
                  onClick={addOneOff}
                >
                  Add to preview
                </button>
                <button type="button" className="fs-button-ghost" onClick={() => setOneOff(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="fs-filters">
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="button" className="fs-button fs-align-end" disabled={busy || selected.size === 0} onClick={() => void generate()}>
              {busy ? 'Generating…' : 'Generate'}
            </button>
          </div>
          <p className="fs-sub">Leave the dates empty to use each pattern's own validity period.</p>
          {error && (
            <p className="fs-error" role="alert">
              {error}
            </p>
          )}
        </Card>

        {previews && (
          <>
            {previews.length > 0 && (
              <Card>
                <h2>Preview report</h2>
                <Callout tone="info">
                  Previewing {rows.length + (confirmed?.length ?? 0)} flights for {names} between {periodFrom} and {periodTo}.
                </Callout>
                {skipped > 0 && <p className="fs-sub">{skipped} of them already exist and would be skipped.</p>}
                {warnings.map((w) => (
                  <p key={w} className="fs-sub">
                    {w}
                  </p>
                ))}
              </Card>
            )}

            <Callout tone="warn">
              <b>Not saved yet.</b> Flights you do not confirm are lost when you leave this page or generate again. Their approval requests
              stay on the Approvals page.
            </Callout>
            {failedGates > 0 && (
              <Callout tone="crit">
                <b>
                  {failedGates} {failedGates === 1 ? 'flight' : 'flights'} failed a gate.
                </b>{' '}
                {rows.find((r) => r.check === 'failed')?.checkText} Change its aircraft, then check again.
              </Callout>
            )}

            <div className="fs-title-row fs-mt-lg">
              <h2 className="fs-section-title">Unsaved preview · {rows.length} flights</h2>
              <button
                type="button"
                className="fs-button-light"
                disabled={rows.length === 0}
                onClick={() => discard(new Set(rows.map((r) => r.key)))}
              >
                Discard all
              </button>
            </div>

            {picked.size > 0 && (
              <section className="fs-batch">
                <div className="fs-batch-head">
                  <span>
                    {picked.size} preview {picked.size === 1 ? 'flight' : 'flights'} selected
                  </span>
                  <span className="fs-actions">
                    {CONNECTED.approvals && (
                      <button type="button" className="fs-button" disabled={approvedCount === 0} onClick={() => void confirmApproved()}>
                        Confirm approved ({approvedCount})
                      </button>
                    )}
                    {CONNECTED.approvals && (
                      <button type="button" className="fs-button-light" disabled={passedCount === 0} onClick={() => void requestApproval()}>
                        Request approval ({passedCount})
                      </button>
                    )}
                    {CONNECTED.gates && (
                      <button type="button" className="fs-button-light" onClick={() => void checkGates()}>
                        Check gates ({picked.size})
                      </button>
                    )}
                    {CONNECTED.aircraft && (
                      <button type="button" className="fs-button-light" onClick={() => setAssigning(true)}>
                        Assign aircraft…
                      </button>
                    )}
                    <button type="button" className="fs-button-light" onClick={() => discard(picked)}>
                      Discard selected
                    </button>
                    <button type="button" className="fs-button-ghost" onClick={() => setPicked(new Set())}>
                      Clear selection
                    </button>
                  </span>
                </div>
                {assigning && (
                  <div className="fs-batch-form">
                    <SelectField label="Aircraft for all selected flights" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                      <option value="">Choose an aircraft</option>
                      {fleet.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </SelectField>
                    <button type="button" className="fs-button" disabled={!assignTo} onClick={assign}>
                      Apply to {picked.size}
                    </button>
                  </div>
                )}
                <p className="fs-sub">
                  Each flight is checked on its own, in departure order, so one failure never blocks the others. Only flights whose gates
                  pass can be sent for approval, and only approved flights can be confirmed. Failed flights stay here and are not saved.
                </p>
              </section>
            )}

            {confirmed && (
              <Card>
                <div className="fs-result-head">
                  <h2>Confirm result</h2>
                  <StatusPill status="ok" label={`207 Multi-Status · ${confirmed.length} ok, 0 failed`} />
                </div>
                <TableWrap>
                  <table className="fs-table fs-t-result">
                    <thead>
                      <tr>
                        <th>Flight</th>
                        <th>Result</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confirmed.map((r) => (
                        <tr key={r.key}>
                          <td>
                            <b>{r.flight}</b> <span className="fs-to">{formatServiceDate(r.date)}</span>
                          </td>
                          <td>
                            <StatusPill status="ok" label="OK" />
                          </td>
                          <td>Saved as scheduled on {r.aircraft}. Approval consumed; flight.created published.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </Card>
            )}

            {rows.length > 0 && (
              <TableWrap>
                <table className="fs-table fs-t-generate">
                  <thead>
                    <tr>
                      <th className="fs-check">
                        <input
                          type="checkbox"
                          aria-label="Select all preview flights"
                          checked={selectable.length > 0 && picked.size === selectable.length}
                          onChange={() => setPicked(picked.size === selectable.length ? new Set() : new Set(selectable.map((r) => r.key)))}
                        />
                      </th>
                      <th>Flight</th>
                      <th>Route</th>
                      <th>Date</th>
                      <th>Departs</th>
                      <th>Arrives</th>
                      {CONNECTED.aircraft && <th>Aircraft</th>}
                      {CONNECTED.gates && <th>Check result</th>}
                      {CONNECTED.approvals && <th>Approval</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className={picked.has(r.key) ? 'fs-row-picked' : undefined}>
                        <td className="fs-check">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.flight} on ${r.date}`}
                            disabled={r.skipped}
                            checked={picked.has(r.key)}
                            onChange={() => togglePicked(r.key)}
                          />
                        </td>
                        <td className="fs-flight fs-plain">{r.flight}</td>
                        <td>
                          <b>{r.origin}</b> <span className="fs-to">to</span> <b>{r.destination}</b>
                        </td>
                        <td>{formatServiceDate(r.date)}</td>
                        <td>{r.departs}</td>
                        <td>
                          {r.arrives}
                          {r.overnight && ' +1'}
                        </td>
                        {CONNECTED.aircraft && (
                          <td>
                            {r.aircraft ? (
                              fleet
                                .find((a) => a.id === r.aircraft)
                                ?.label.split(' · ')
                                .slice(0, 2)
                                .join(' · ')
                            ) : (
                              <span className="fs-to">No aircraft</span>
                            )}
                          </td>
                        )}
                        {CONNECTED.gates && (
                          <td>
                            {r.skipped ? (
                              <span className="fs-to">Already exists, skipped</span>
                            ) : r.check === 'none' ? (
                              <span className="fs-to">{r.checkText || 'Not checked'}</span>
                            ) : (
                              <>
                                <StatusPill
                                  status={r.check === 'passed' ? 'ok' : 'failed'}
                                  label={r.check === 'passed' ? 'Passed' : 'Failed'}
                                />
                                {r.check === 'failed' && <div className="fs-sub fs-sub-crit">{r.checkText}</div>}
                              </>
                            )}
                          </td>
                        )}
                        {CONNECTED.approvals && (
                          <td>
                            {r.approval === 'none' ? (
                              <span className="fs-to">
                                {r.check === 'failed'
                                  ? 'Not requested: fix the failing gate first'
                                  : r.aircraft
                                    ? '—'
                                    : 'Assign an aircraft first'}
                              </span>
                            ) : (
                              <>
                                <StatusPill status={APPROVAL_PILL[r.approval].status} label={APPROVAL_PILL[r.approval].label} />
                                <div className="fs-sub">{r.approval === 'not_requested' ? 'Gates passed' : r.answer}</div>
                                {r.approval === 'offered' && (
                                  <span className="fs-actions fs-start">
                                    {r.slots.map((slot) => (
                                      <button key={slot} type="button" className="fs-button-light" onClick={() => void pickSlot(r, slot)}>
                                        {slot}
                                      </button>
                                    ))}
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
