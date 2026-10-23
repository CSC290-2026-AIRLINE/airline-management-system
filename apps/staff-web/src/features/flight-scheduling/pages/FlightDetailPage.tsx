import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
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
import { TableWrap } from '../components/TableWrap'
import { formatDateTime, WEEKDAYS } from '../format'
import { useDisruptionReasons } from '../hooks/useDisruptionReasons'
import { useNotice } from '../hooks/useNotice'
import { useResource } from '../hooks/useResource'
import {
  MOCK_AIRCRAFT,
  MOCK_COST,
  mockApplyDelay,
  mockCancelFlight,
  mockChangeAircraft,
  mockCheckReschedule,
  type MockCheck,
} from '../mocks/cross-feature'
import type { AirportFeeRow, FlightDetail, FlightRow, TimetableRow } from '../types'
import '../flight-scheduling.css'

const thb = (n: number) => `${Math.round(n).toLocaleString('en-US')} THB`

export function FlightDetailPage({ flightId }: { flightId: string }) {
  const { reasons } = useDisruptionReasons()
  const { fetchWithAuth } = useAppAuth()
  const flight = useResource<FlightDetail>(`/flights/${flightId}`, fetchWithAuth)
  const pattern = useResource<TimetableRow>(flight.data?.pattern_id ? `/timetables/${flight.data.pattern_id}` : null, fetchWithAuth)

  const originFees = useResource<{ data: AirportFeeRow[] }>(
    flight.data?.route.origin ? `/airport-fees?airport=${flight.data.route.origin.iata_code}` : null,
    fetchWithAuth,
  )
  const destinationFees = useResource<{ data: AirportFeeRow[] }>(
    flight.data ? `/airport-fees?airport=${flight.data.effective_destination}` : null,
    fetchWithAuth,
  )

  // ponytail: MOCK. What the demo actions changed, shown on top of the real flight; reloading the page drops it.
  const [changes, setChanges] = useState<Partial<FlightDetail>>({})
  const [tail, setTail] = useState<string | null>(null)
  const [events, setEvents] = useState<string[]>([])
  const [notice, say] = useNotice()
  const [warn, setWarn] = useState(false)
  const [costOpen, setCostOpen] = useState(false)

  const [aircraft, setAircraft] = useState('')
  const [mode, setMode] = useState<'delay' | 'cancel'>('delay')
  const [reason, setReason] = useState('')
  const [minutes, setMinutes] = useState('45')
  const [resolution, setResolution] = useState('Refund')
  const [note, setNote] = useState('')
  const [proposed, setProposed] = useState('')
  const [checks, setChecks] = useState<MockCheck[] | null>(null)
  const [requested, setRequested] = useState(false)

  function done(message: string, ok: boolean, event?: string) {
    setWarn(!ok)
    say(message)
    if (ok && event) setEvents((e) => [event, ...e])
  }

  let body
  if (flight.loading) body = <p>Loading flight…</p>
  else if (flight.error || !flight.data) body = <p role="alert">Could not load the flight: {flight.error}</p>
  else {
    const f: FlightDetail = { ...flight.data, ...changes }
    const originZone = f.route.origin?.timezone ?? 'UTC'
    const destZone = f.route.destination?.timezone ?? 'UTC'
    const origin = f.route.origin?.iata_code ?? '—'
    const destination = f.effective_destination
    const currentTail = tail ?? f.aircraft.tail_number
    // The mock actions take a list row; this is the same flight in that shape.
    const row: FlightRow = { ...f, route_id: f.route.id, aircraft: { tail_number: currentTail } }
    const blockHours = f.route.block_time_min / 60
    // The fees in force on the service date at each end: departure fees at the origin, arrival fees at the destination.
    // ponytail: amounts are treated as THB, and per-tonne fees need the aircraft weight from F9, so they show as 0 for now.
    const day = f.service_date.slice(0, 10)
    const inForce = (fee: AirportFeeRow) => fee.effective_from <= day && (fee.effective_to === null || fee.effective_to >= day)
    const feeLines = [
      ...(originFees.data?.data ?? []).filter((x) => x.applies_on === 'departure' && inForce(x)),
      ...(destinationFees.data?.data ?? []).filter((x) => x.applies_on === 'arrival' && inForce(x)),
    ].map((fee) => {
      const hours = fee.unit === 'per_hour' ? MOCK_COST.groundHours : 1
      const unitText =
        fee.unit === 'per_flight'
          ? `${thb(fee.amount)} per flight`
          : fee.unit === 'per_hour'
            ? `${thb(fee.amount)} per hour × ${MOCK_COST.groundHours} h planned ground time`
            : `${thb(fee.amount)} per tonne (aircraft weight comes from feature 9)`
      return {
        item: `${fee.airport} ${fee.fee_type} fee · ${fee.applies_on}`,
        basis: unitText,
        amount: fee.unit === 'per_tonne' ? 0 : fee.amount * hours,
      }
    })
    const cost = [
      {
        item: 'Operating cost',
        basis: `${blockHours.toFixed(2)} block hours at ${thb(MOCK_COST.operatingPerHour)} per hour (feature 9)`,
        amount: blockHours * MOCK_COST.operatingPerHour,
      },
      ...feeLines,
    ]
    const estimated = cost.reduce((sum, c) => sum + c.amount, 0)
    const revenue = MOCK_COST.seats * MOCK_COST.seatPrice
    const arrivalProposed = proposed
      ? formatDateTime(new Date(Date.parse(`${proposed}:00Z`) + f.route.block_time_min * 60000).toISOString(), 'UTC')
      : '—'

    async function changeAircraft() {
      const [result] = await mockChangeAircraft([row], aircraft)
      if (result.ok) setTail(aircraft)
      done(result.ok ? `Aircraft changed to ${aircraft}.` : result.detail, result.ok, `aircraft changed to ${aircraft}`)
    }

    async function recordDelay() {
      const [result] = await mockApplyDelay([row], Number(minutes))
      if (result.ok) {
        const add = Number(minutes) * 60000
        setChanges({
          ...changes,
          status: 'delayed',
          dep_at: new Date(Date.parse(f.dep_at) + add).toISOString(),
          arr_at: new Date(Date.parse(f.arr_at) + add).toISOString(),
          delay_minutes: f.delay_minutes + Number(minutes),
        })
      }
      done(result.ok ? `Delay of ${minutes} min recorded.` : result.detail, result.ok, `delay of ${minutes} min recorded (${reason})`)
    }

    async function cancel() {
      const result = await mockCancelFlight(row, reason, resolution)
      if (result.ok) setChanges({ ...changes, status: 'cancelled' })
      done(result.ok ? 'Flight cancelled.' : result.detail, result.ok, `cancelled (${reason}, ${resolution})`)
    }

    async function check() {
      setRequested(false)
      setChecks(await mockCheckReschedule(currentTail, f.route.distance_km))
    }

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
                <b>{currentTail}</b>
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

        <MockNotice>
          The cost figures, expected revenue, open conflicts, aircraft change, disruptions, reschedule checks and approval are simulated
          until the other features are connected. The flight itself is real.
        </MockNotice>

        <Card>
          <div className={costOpen ? 'fs-fold is-open' : 'fs-fold'}>
            <div className="fs-fold-head">
              <h2>Cost estimate</h2>
              <button type="button" className="fs-fold-toggle" aria-expanded={costOpen} onClick={() => setCostOpen(!costOpen)}>
                {thb(estimated)}
              </button>
            </div>
            <div className="fs-fold-body">
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
                Expected revenue (feature 4 fare quote and feature 3b seats sold): {MOCK_COST.seats} seats at {thb(MOCK_COST.seatPrice)} ={' '}
                {thb(revenue)}. Calculated when you open this page and not stored on the flight.
              </p>
            </div>
            {revenue < estimated && (
              <Callout tone="crit">
                <b>Loss warning.</b> Expected revenue is {thb(estimated - revenue)} lower than the estimated cost. Change the aircraft or
                reschedule before confirming.
              </Callout>
            )}
          </div>
        </Card>

        <Card>
          <h2>Open conflicts</h2>
          <p className="fs-sub">No open conflicts for this flight.</p>
        </Card>

        {f.status === 'cancelled' ? (
          <Callout tone="crit">
            <b>This flight is cancelled.</b> A cancelled flight cannot be changed, delayed, diverted or rescheduled. Its history stays
            below.
          </Callout>
        ) : (
          <>
            <div className="fs-two">
              <Card>
                <h2>Aircraft</h2>
                <p className="fs-sub">
                  Changing the aircraft publishes flight.aircraft_changed. If the type differs, feature 3b re-seats passengers.
                </p>
                <SelectField label="Aircraft (from feature 9, demo)" value={aircraft} onChange={(e) => setAircraft(e.target.value)}>
                  <option value="">Choose an aircraft</option>
                  {MOCK_AIRCRAFT.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </SelectField>
                <button type="button" className="fs-button fs-mt" disabled={!aircraft} onClick={() => void changeAircraft()}>
                  Change aircraft
                </button>
              </Card>

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
                      <option key={r.code} value={r.label}>
                        {r.label}
                      </option>
                    ))}
                  </SelectField>
                  {mode === 'delay' ? (
                    <FormField label="Delay (minutes)" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                  ) : (
                    <SelectField label="Resolution" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                      <option>Refund</option>
                      <option>Rebook with partner</option>
                    </SelectField>
                  )}
                </div>
                <FormField label="Note (optional, not used for grouping)" value={note} onChange={(e) => setNote(e.target.value)} />
                <p className="fs-sub">
                  {mode === 'delay'
                    ? `A delay moves departure and arrival, then walks ${currentTail}'s later flights that day and raises or updates cascade conflicts.`
                    : 'Cancelling publishes flight.cancelled with the resolution. Feature 5b refunds; with a partner rebooking, 3b creates the new segment.'}
                </p>
                {mode === 'delay' ? (
                  <button type="button" className="fs-button" disabled={!reason || Number(minutes) < 1} onClick={() => void recordDelay()}>
                    Record delay
                  </button>
                ) : (
                  <button type="button" className="fs-button-danger" disabled={!reason} onClick={() => void cancel()}>
                    Cancel this flight
                  </button>
                )}
              </Card>
            </div>

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
                  <div className="fs-form-actions">
                    <button
                      type="button"
                      className="fs-button"
                      disabled={requested || checks.some((c) => c.label !== 'Passed')}
                      onClick={() => setRequested(true)}
                    >
                      Request approval for {proposed.slice(11, 16)}
                    </button>
                    <span className="fs-sub">Approved requests move the flight and publish flight.rescheduled.</span>
                  </div>
                  {requested && (
                    <Callout tone="info">
                      Approval requested. The {origin} slot coordinator (simulated) answers on the Approvals page.
                    </Callout>
                  )}
                </>
              )}
            </Card>
          </>
        )}

        <Card>
          <h2>Event history</h2>
          <ul className="fs-events">
            {events.map((e) => (
              <li key={e}>
                <span className="fs-to">now</span> {e} <span className="fs-to">by staff (demo)</span>
              </li>
            ))}
            <li>
              <span className="fs-to">{formatDateTime(f.created_at, originZone)}</span> confirmed and published to other features{' '}
              <span className="fs-to">by staff</span>
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
