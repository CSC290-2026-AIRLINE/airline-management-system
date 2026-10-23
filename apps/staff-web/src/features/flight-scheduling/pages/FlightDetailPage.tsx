import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { SegmentedControl } from '../components/SegmentedControl'
import { Callout } from '../components/Callout'
import { FormField } from '../components/FormField'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { StatusPill } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import { Card } from '../components/Card'
import { TableWrap } from '../components/TableWrap'
import { AIRCRAFT, checkReschedule, CONNECTED, costInputsFor, partnersFor, requestReschedule } from '../connected'
import { capitalize, formatDateTime, WEEKDAYS } from '../format'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import type { AirportFeeRow, ConflictRow, FlightDetail, FlightEventRow, RescheduleCheck, TimetableRow } from '../types'
import '../flight-scheduling.css'

const thb = (n: number) => `${Math.round(n).toLocaleString('en-US')} THB`
const UNIT: Record<string, string> = { per_flight: 'per flight', per_hour: 'per hour on the ground', per_tonne: 'per tonne' }

// "delayed 45 min · WX · note" from one flight_event row.
function eventText(e: FlightEventRow) {
  return [e.type.replace(/_/g, ' '), e.delay_minutes ? `${e.delay_minutes} min` : null, e.disruption_reason_code, e.note]
    .filter(Boolean)
    .join(' · ')
}

export function FlightDetailPage({ flightId }: { flightId: string }) {
  const { reasons } = useDisruptionReasons()
  const { fetchWithAuth } = useAppAuth()
  const flight = useResource<FlightDetail>(`/flights/${flightId}`, fetchWithAuth)
  const events = useResource<FlightEventRow[]>(`/flights/${flightId}/events`, fetchWithAuth)
  const conflicts = useResource<ConflictRow[]>(`/conflicts?flight_id=${flightId}`, fetchWithAuth)
  const pattern = useResource<TimetableRow>(flight.data?.pattern_id ? `/timetables/${flight.data.pattern_id}` : null, fetchWithAuth)

  const originFees = useResource<{ data: AirportFeeRow[] }>(
    flight.data?.route.origin ? `/airport-fees?airport=${flight.data.route.origin.iata_code}` : null,
    fetchWithAuth,
  )
  const destinationFees = useResource<{ data: AirportFeeRow[] }>(
    flight.data ? `/airport-fees?airport=${flight.data.effective_destination}` : null,
    fetchWithAuth,
  )

  const [notice, say] = useNotice()
  const [warn, setWarn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [costOpen, setCostOpen] = useState(false)

  const [mode, setMode] = useState<'delay' | 'cancel'>('delay')
  const [reason, setReason] = useState('')
  const [minutes, setMinutes] = useState('45')
  const [resolution, setResolution] = useState<'refund' | 'rebook_partner'>('refund')
  const [partner, setPartner] = useState('')
  const [note, setNote] = useState('')
  const [aircraft, setAircraft] = useState('')
  const [proposed, setProposed] = useState('')
  const [checks, setChecks] = useState<RescheduleCheck[] | null>(null)
  const [requested, setRequested] = useState(false)

  // Sends one disruption to the backend, then reloads the flight, its events and its conflicts.
  async function send(path: string, method: 'POST' | 'PUT', body: object, success: string) {
    setBusy(true)
    try {
      const res = await fetchWithAuth(`${BASE}/flights/${flightId}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(note.trim() && { note: note.trim() }), ...body }),
      })
      setWarn(!res.ok)
      say(res.ok ? success : await errorMessage(res))
      if (res.ok) {
        setNote('')
        flight.reload()
        events.reload()
        conflicts.reload()
      }
    } catch (e) {
      setWarn(true)
      say(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const record = (action: 'delay' | 'cancel', body: object, success: string) =>
    send(action, 'POST', { reason_code: reason, ...body }, success)

  async function check() {
    setRequested(false)
    try {
      setChecks(await checkReschedule(flightId, proposed))
    } catch (e) {
      setWarn(true)
      say(e instanceof Error ? e.message : String(e))
    }
  }

  async function request() {
    try {
      await requestReschedule(flightId, proposed)
      setRequested(true)
    } catch (e) {
      setWarn(true)
      say(e instanceof Error ? e.message : String(e))
    }
  }

  let body
  if (flight.loading) body = <p>Loading flight…</p>
  else if (flight.error || !flight.data) body = <p role="alert">Could not load the flight: {flight.error}</p>
  else {
    const f = flight.data
    const originZone = f.route.origin?.timezone ?? 'UTC'
    const destZone = f.route.destination?.timezone ?? 'UTC'
    const origin = f.route.origin?.iata_code ?? '—'
    const destination = f.effective_destination
    // The fees in force on the service date at each end: departure fees at the origin, arrival fees at the destination.
    const day = f.service_date.slice(0, 10)
    const inForce = (fee: AirportFeeRow) => fee.effective_from <= day && (fee.effective_to === null || fee.effective_to >= day)
    const fees = [
      ...(originFees.data?.data ?? []).filter((x) => x.applies_on === 'departure' && inForce(x)),
      ...(destinationFees.data?.data ?? []).filter((x) => x.applies_on === 'arrival' && inForce(x)),
    ]
    const open = conflicts.data ?? []
    const partners = partnersFor(origin, destination)
    // The full estimate needs feature 9 (operating cost, aircraft weight), the planned ground time and features 4 and 3b (revenue);
    // until they are connected only the fees are listed. ponytail: amounts are treated as THB.
    const inputs = costInputsFor()
    const blockHours = f.route.block_time_min / 60
    const cost = inputs && [
      {
        item: 'Operating cost',
        basis: `${blockHours.toFixed(2)} block hours at ${thb(inputs.operatingPerHour)} per hour (feature 9)`,
        amount: blockHours * inputs.operatingPerHour,
      },
      ...fees.map((fee) => ({
        item: `${fee.airport} ${fee.fee_type} fee · ${fee.applies_on}`,
        basis:
          fee.unit === 'per_flight'
            ? `${thb(fee.amount)} per flight`
            : fee.unit === 'per_hour'
              ? `${thb(fee.amount)} per hour × ${inputs.groundHours} h planned ground time`
              : `${thb(fee.amount)} per tonne (aircraft weight comes from feature 9)`,
        amount: fee.unit === 'per_tonne' ? 0 : fee.amount * (fee.unit === 'per_hour' ? inputs.groundHours : 1),
      })),
    ]
    const estimated = cost?.reduce((sum, c) => sum + c.amount, 0) ?? 0
    const revenue = inputs ? inputs.seats * inputs.seatPrice : 0
    const arrivalProposed = proposed
      ? formatDateTime(new Date(Date.parse(`${proposed}:00Z`) + f.route.block_time_min * 60000).toISOString(), 'UTC')
      : '—'

    body = (
      <>
        <Card first>
          <div className="fs-flight-head">
            <span className="fs-flight-no">{f.flight_number}</span>
            <span className="fs-flight-route">
              {origin} to {destination}
            </span>
            <StatusPill status={f.status} />
          </div>
          <dl className="fs-kv fs-kv-pairs">
            <div>
              <dt>Departure</dt>
              <dd>{formatDateTime(f.dep_at, originZone)}</dd>
            </div>
            <div>
              <dt>Arrival</dt>
              <dd>{formatDateTime(f.arr_at, destZone)}</dd>
            </div>
            <div>
              <dt>Service date</dt>
              <dd>
                {f.service_date.slice(0, 10)}
                <span className="fs-wide-only"> · local date at {origin} of the original departure; never changes</span>
              </dd>
            </div>
            <div>
              <dt>Block time</dt>
              <dd>
                {f.route.block_time_min} min, {f.route.distance_km} km
              </dd>
            </div>
            <div>
              <dt>Aircraft</dt>
              <dd>
                <b>{f.aircraft.tail_number}</b>
              </dd>
            </div>
            {pattern.data && (
              <div>
                <dt>Pattern</dt>
                <dd>
                  {pattern.data.flight_number} · {pattern.data.dep_time_local} on{' '}
                  {pattern.data.days_of_week.map((d) => WEEKDAYS[d - 1]).join(', ')}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        <Card>
          <div className={costOpen ? 'fs-fold is-open' : 'fs-fold'}>
            <div className="fs-fold-head">
              <h2>Cost estimate</h2>
              <button type="button" className="fs-fold-toggle" aria-expanded={costOpen} onClick={() => setCostOpen(!costOpen)}>
                {cost ? thb(estimated) : `${fees.length} ${fees.length === 1 ? 'fee' : 'fees'}`}
              </button>
            </div>
            <div className="fs-fold-body">
              {cost && inputs && (
                <>
                  <p className="fs-sub">
                    Block time times the aircraft type operating cost (feature 9), plus departure fees at {origin} and arrival fees at{' '}
                    {destination}.
                  </p>
                  <TableWrap>
                    <table className="fs-table fs-t-cost">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Basis</th>
                          <th className="fs-num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cost.map((c) => (
                          <tr key={c.item}>
                            <td>{c.item}</td>
                            <td className="fs-to">{c.basis}</td>
                            <td className="fs-num">{thb(c.amount)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td>
                            <b>Estimated cost</b>
                          </td>
                          <td></td>
                          <td className="fs-num">
                            <b>{thb(estimated)}</b>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </TableWrap>
                  <p className="fs-sub">
                    Expected revenue (feature 4 fare quote and feature 3b seats sold): {inputs.seats} seats at {thb(inputs.seatPrice)} ={' '}
                    {thb(revenue)}. Calculated when you open this page and not stored on the flight.
                  </p>
                  {revenue < estimated && (
                    <Callout tone="crit">
                      <b>Loss warning.</b> Expected revenue is {thb(estimated - revenue)} lower than the estimated cost. Change the aircraft
                      or reschedule before confirming.
                    </Callout>
                  )}
                </>
              )}
              {cost ? null : fees.length === 0 ? (
                <p className="fs-sub">
                  No departure fees at {origin} or arrival fees at {destination} are in force on {day}.
                </p>
              ) : (
                <TableWrap>
                  <table className="fs-table fs-t-cost">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Basis</th>
                        <th className="fs-num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fees.map((fee) => (
                        <tr key={fee.id}>
                          <td>
                            {fee.airport} {fee.fee_type} fee · {fee.applies_on}
                          </td>
                          <td className="fs-to">{UNIT[fee.unit] ?? fee.unit}</td>
                          <td className="fs-num">{thb(fee.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <h2>Open conflicts</h2>
          {conflicts.error && <p role="alert">Could not load conflicts: {conflicts.error}</p>}
          {conflicts.loading && <p>Loading conflicts…</p>}
          {!conflicts.loading && !conflicts.error && open.length === 0 && <p className="fs-sub">No open conflicts for this flight.</p>}
          {open.map((c) => (
            <Callout key={c.id} tone="crit" action={<Link to="/conflicts">Resolve</Link>}>
              <b>{capitalize(c.kind.replace(/_/g, ' '))}.</b> {c.detail}
            </Callout>
          ))}
        </Card>

        {f.status === 'cancelled' ? (
          <Callout tone="crit">
            <b>This flight is cancelled.</b> A cancelled flight cannot be changed, delayed, diverted or rescheduled. Its history stays
            below.
          </Callout>
        ) : (
          <>
            <div className="fs-two">
              {CONNECTED.aircraft && (
                <Card>
                  <h2>Aircraft</h2>
                  <p className="fs-sub">
                    Changing the aircraft publishes flight.aircraft_changed. If the type differs, feature 3b re-seats passengers.
                  </p>
                  <SelectField label="Aircraft (from feature 9)" value={aircraft} onChange={(e) => setAircraft(e.target.value)}>
                    <option value="">Choose an aircraft</option>
                    {AIRCRAFT.map((a) => (
                      <option key={a.id} value={a.id} disabled={!a.usable}>
                        {a.label}
                      </option>
                    ))}
                  </SelectField>
                  <button
                    type="button"
                    className="fs-button fs-mt"
                    disabled={busy || !aircraft}
                    onClick={() => void send('aircraft', 'PUT', { aircraft_id: aircraft }, 'Aircraft changed.')}
                  >
                    Change aircraft
                  </button>
                </Card>
              )}

              <Card>
                <h2>Record a disruption</h2>
                <p className="fs-sub">
                  Each one needs a disruption reason and is published to the event stream. Delays, holding and diversions need no approval.
                </p>
                <SegmentedControl
                  options={['delay', 'cancel'] as const}
                  labels={{ delay: 'Delay', cancel: 'Cancel flight' }}
                  value={mode}
                  onChange={setMode}
                />
                <div className="fs-form-grid fs-form-grid-2">
                  <SelectField label="Disruption reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Choose a disruption reason</option>
                    {reasons.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </SelectField>
                  {mode === 'delay' ? (
                    <FormField label="Delay (minutes)" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                  ) : (
                    <SelectField
                      label="Resolution"
                      value={resolution}
                      onChange={(e) => {
                        setResolution(e.target.value as 'refund' | 'rebook_partner')
                        setPartner('')
                      }}
                    >
                      <option value="refund">Refund</option>
                      {CONNECTED.partnerRoutes && <option value="rebook_partner">Rebook with partner</option>}
                    </SelectField>
                  )}
                </div>
                {mode === 'cancel' && resolution === 'rebook_partner' && (
                  <SelectField label="Partner airline" value={partner} onChange={(e) => setPartner(e.target.value)}>
                    <option value="">Choose a partner airline</option>
                    {partners.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </SelectField>
                )}
                <FormField label="Note (optional, not used for grouping)" value={note} onChange={(e) => setNote(e.target.value)} />
                <p className="fs-sub">
                  {mode === 'delay'
                    ? `A delay moves departure and arrival, then walks ${f.aircraft.tail_number}'s later flights that day and raises or updates cascade conflicts.`
                    : 'Cancelling publishes flight.cancelled with the resolution. Feature 5b refunds; with a partner rebooking, 3b creates the new segment.'}
                </p>
                {mode === 'delay' ? (
                  <button
                    type="button"
                    className="fs-button"
                    disabled={busy || !reason || !(Number.isInteger(Number(minutes)) && Number(minutes) > 0)}
                    onClick={() => void record('delay', { delay_minutes: Number(minutes) }, `Delay of ${minutes} min recorded.`)}
                  >
                    Record delay
                  </button>
                ) : (
                  <button
                    type="button"
                    className="fs-button-danger"
                    disabled={busy || !reason || (resolution === 'rebook_partner' && !partner)}
                    onClick={() =>
                      void record(
                        'cancel',
                        { resolution, ...(resolution === 'rebook_partner' && { partner_airline: partner }) },
                        'Flight cancelled.',
                      )
                    }
                  >
                    Cancel this flight
                  </button>
                )}
              </Card>
            </div>

            {CONNECTED.gates && (
              <Card>
                <h2>Check another time or reschedule</h2>
                <p className="fs-sub">
                  A reschedule changes the published timetable, so it needs an approval from the simulated {origin} slot coordinator first.
                  The checks are read-only until you request approval.
                </p>
                <div className="fs-filters">
                  <FormField
                    label="Proposed departure"
                    type="datetime-local"
                    value={proposed}
                    onChange={(e) => setProposed(e.target.value)}
                  />
                  <FormField label="Arrival (from block time)" value={arrivalProposed} readOnly />
                  <button
                    type="button"
                    className="fs-button-light fs-button-lg fs-align-end"
                    disabled={!proposed}
                    onClick={() => void check()}
                  >
                    Check availability
                  </button>
                </div>
                {checks && (
                  <>
                    <ul className="fs-checks">
                      {checks.map((c) => (
                        <li key={c.text}>
                          <StatusPill status={c.label === 'Passed' ? 'ok' : 'failed'} label={c.label} /> {c.text}
                        </li>
                      ))}
                    </ul>
                    {CONNECTED.approvals && (
                      <div className="fs-form-actions">
                        <button
                          type="button"
                          className="fs-button"
                          disabled={requested || checks.some((c) => c.label !== 'Passed')}
                          onClick={() => void request()}
                        >
                          Request approval for {proposed.slice(11, 16)}
                        </button>
                        <span className="fs-sub">Approved requests move the flight and publish flight.rescheduled.</span>
                      </div>
                    )}
                    {requested && (
                      <Callout tone="info">
                        Approval requested. The {origin} slot coordinator (simulated) answers on the Approvals page.
                      </Callout>
                    )}
                  </>
                )}
              </Card>
            )}
          </>
        )}

        <Card>
          <h2>Event history</h2>
          {events.error && <p role="alert">Could not load events: {events.error}</p>}
          {events.loading && <p>Loading events…</p>}
          <ul className="fs-events">
            {[...(events.data ?? [])].reverse().map((e) => (
              <li key={e.id}>
                <span className="fs-to">{formatDateTime(e.occurred_at, originZone)}</span> {eventText(e)}
              </li>
            ))}
            <li>
              <span className="fs-to">{formatDateTime(f.created_at, originZone)}</span> confirmed and published to other features
            </li>
          </ul>
        </Card>
      </>
    )
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <Link to="/schedule-board" className="fs-back">
          ‹ Back to schedule board
        </Link>
        <PageHeader title="Flight detail">
          One saved flight: change its aircraft, record a disruption, check another time or reschedule it through an approval. Every change
          is one event on the stream.
        </PageHeader>
        {body}
        <Toast message={notice} tone={warn ? 'warn' : 'default'} />
      </main>
    </StaffShell>
  )
}
