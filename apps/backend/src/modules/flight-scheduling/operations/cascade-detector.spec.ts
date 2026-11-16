import { CascadeDetector } from './cascade-detector'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`)
const AIRCRAFT = '00000000-0000-0000-0000-0000000000a1'

const row = (id: string, origin: string, destination: string, dep: string, arr: string, depAt = dep, arrAt = arr, over: object = {}) => ({
  id,
  flight_number: id,
  status: 'scheduled',
  scheduled_dep_at: at(dep),
  dep_at: at(depAt),
  arr_at: at(arrAt),
  actual_destination: null,
  route: { origin, destination },
  ...over,
})

const openConflict = (id: string, flightId: string, kind: string, causeFlightId: string | null, causedBy: string | null) => ({
  id,
  flight_id: flightId,
  kind,
  caused_by_event_id: causedBy,
  flight_event_schedule_conflict_caused_by_event_idToflight_event: causeFlightId ? { flight_id: causeFlightId } : null,
})

describe('CascadeDetector.refresh', () => {
  const tx = {
    flight: { findMany: jest.fn() },
    schedule_conflict: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  }
  const feasibility = { turnaroundResolver: jest.fn() }
  const detector = new CascadeDetector(feasibility as never, { now: () => at('05:00') })
  const delayTrigger = (flightId: string, eventId = 'delay-1') => ({ flightId, eventId, eventType: 'delayed' })

  beforeEach(() => {
    jest.resetAllMocks()
    feasibility.turnaroundResolver.mockResolvedValue(() => 60)
    tx.schedule_conflict.findMany.mockResolvedValue([])
  })

  it('opens a cascade conflict on the later flight, linked to the delay event, with the exact rule', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '07:00', '09:00'),
      row('F2', 'ZZB', 'ZZA', '09:30', '11:00'),
    ])

    const summary = await detector.refresh(tx as never, AIRCRAFT, delayTrigger('F1'))

    expect(summary).toEqual({ opened: 1, updated: 0, superseded: 0 })
    expect(tx.schedule_conflict.create).toHaveBeenCalledWith({
      data: {
        flight_id: 'F2',
        kind: 'cascade',
        detail: expect.stringContaining('short by 30 min (needs 60'),
        facts: expect.objectContaining({
          rule: 'turnaround_short',
          causeFlightId: 'F1',
          gapMinutes: 30,
          requiredMinutes: 60,
          shortByMinutes: 30,
        }),
        detected_at: at('05:00'),
        caused_by_event_id: 'delay-1',
      },
    })
  })

  it('reaches every later flight a long delay breaks, all linked to the same delay', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '09:00', '11:00'),
      row('F2', 'ZZB', 'ZZA', '09:00', '10:00'),
      row('F3', 'ZZA', 'ZZB', '11:30', '12:30'),
    ])

    await detector.refresh(tx as never, AIRCRAFT, delayTrigger('F1'))

    const created = (
      tx.schedule_conflict.create.mock.calls as [{ data: { flight_id: string; kind: string; caused_by_event_id: string } }][]
    ).map(([a]) => [a.data.flight_id, a.data.kind, a.data.caused_by_event_id])
    expect(created).toEqual([
      ['F2', 'cascade', 'delay-1'],
      ['F3', 'cascade', 'delay-1'],
    ])
  })

  it('updates the open cascade on a further delay instead of opening a second one', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '07:10', '09:10'),
      row('F2', 'ZZB', 'ZZA', '09:30', '11:00'),
    ])
    tx.schedule_conflict.findMany.mockResolvedValue([openConflict('c1', 'F2', 'cascade', 'F1', 'delay-1')])

    const summary = await detector.refresh(tx as never, AIRCRAFT, delayTrigger('F1', 'delay-2'))

    expect(summary).toEqual({ opened: 0, updated: 1, superseded: 0 })
    expect(tx.schedule_conflict.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ caused_by_event_id: 'delay-2', facts: expect.objectContaining({ gapMinutes: 20 }) }),
    })
    expect(tx.schedule_conflict.create).not.toHaveBeenCalled()
  })

  it('re-walks an earlier cascade on any event and supersedes it when the cause is gone', async () => {
    // F1 is back on time (for example after a reschedule), so F2 connects again.
    tx.flight.findMany.mockResolvedValue([row('F1', 'ZZA', 'ZZB', '06:00', '08:00'), row('F2', 'ZZB', 'ZZA', '09:30', '11:00')])
    tx.schedule_conflict.findMany.mockResolvedValue([openConflict('c1', 'F2', 'cascade', 'F1', 'delay-1')])

    const summary = await detector.refresh(tx as never, AIRCRAFT, { flightId: 'F1', eventId: 'e9', eventType: 'rescheduled' })

    expect(summary).toEqual({ opened: 0, updated: 0, superseded: 1 })
    expect(tx.schedule_conflict.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1'] } },
      data: expect.objectContaining({ status: 'superseded' }),
    })
  })

  it('supersedes a cascade whose delayed flight has left the aircraft', async () => {
    tx.flight.findMany.mockResolvedValue([row('F2', 'ZZB', 'ZZA', '09:30', '11:00')])
    tx.schedule_conflict.findMany.mockResolvedValue([openConflict('c1', 'F2', 'cascade', 'F1', 'delay-1')])

    await expect(detector.refresh(tx as never, AIRCRAFT, null)).resolves.toEqual({ opened: 0, updated: 0, superseded: 1 })
  })

  it('does not start a cascade from an event that is not a delay', async () => {
    // A hold also moves the arrival, but Iteration-03 starts cascades from delays only.
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '06:00', '09:00'),
      row('F2', 'ZZB', 'ZZA', '09:30', '11:00'),
    ])

    await detector.refresh(tx as never, AIRCRAFT, { flightId: 'F1', eventId: 'hold-1', eventType: 'holding' })

    expect(tx.schedule_conflict.create).not.toHaveBeenCalled()
  })

  it('raises aircraft_position, not cascade, when a diversion leaves the next flight at the wrong airport', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '06:00', '08:00', { actual_destination: 'ZZD', status: 'diverted' }),
      row('F2', 'ZZB', 'ZZA', '09:30', '11:00'),
    ])

    await detector.refresh(tx as never, AIRCRAFT, { flightId: 'F1', eventId: 'divert-1', eventType: 'diverted' })

    expect(tx.schedule_conflict.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        flight_id: 'F2',
        kind: 'aircraft_position',
        caused_by_event_id: 'divert-1',
        facts: expect.objectContaining({ rule: 'previous_ends_elsewhere', actualAirport: 'ZZD' }),
      }),
    })
  })

  // Regression: found by the rolled-back database run. A dismissed conflict was re-opened by the next unrelated event.
  it('does not re-open a dismissed position conflict on an unrelated event', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '06:00', '08:00', { actual_destination: 'ZZD', status: 'diverted' }),
      row('F2', 'ZZB', 'ZZA', '09:30', '11:00'),
    ])
    // No open row: staff dismissed it. A hold on F1 is not a trigger that raises aircraft_position.
    const summary = await detector.refresh(tx as never, AIRCRAFT, { flightId: 'F1', eventId: 'hold-1', eventType: 'holding' })

    expect(summary).toEqual({ opened: 0, updated: 0, superseded: 0 })
    expect(tx.schedule_conflict.create).not.toHaveBeenCalled()
  })

  it('keeps an open position conflict up to date on an unrelated event, without relinking it', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '06:00', '08:00', { actual_destination: 'ZZD', status: 'diverted' }),
      row('F2', 'ZZB', 'ZZA', '09:30', '11:00'),
    ])
    tx.schedule_conflict.findMany.mockResolvedValue([openConflict('c1', 'F2', 'aircraft_position', 'F1', 'divert-1')])

    const summary = await detector.refresh(tx as never, AIRCRAFT, { flightId: 'F1', eventId: 'hold-1', eventType: 'holding' })

    expect(summary).toEqual({ opened: 0, updated: 1, superseded: 0 })
    expect(tx.schedule_conflict.update.mock.calls[0][0].data).not.toHaveProperty('caused_by_event_id')
  })

  it('raises aircraft_position only on the flight right after the diverted one', async () => {
    // F2 is diverted; the F0 -> F1 link was already broken before and is not this diversion's doing.
    tx.flight.findMany.mockResolvedValue([
      row('F0', 'ZZX', 'ZZY', '03:00', '04:00'),
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00'),
      row('F2', 'ZZB', 'ZZA', '09:00', '10:00', '09:00', '10:00', { actual_destination: 'ZZD', status: 'diverted' }),
      row('F3', 'ZZA', 'ZZB', '12:00', '13:00'),
    ])

    await detector.refresh(tx as never, AIRCRAFT, { flightId: 'F2', eventId: 'divert-2', eventType: 'diverted' })

    const created = (tx.schedule_conflict.create.mock.calls as [{ data: { flight_id: string } }][]).map(([a]) => a.data.flight_id)
    expect(created).toEqual(['F3'])
  })

  it('does not open a new cascade from re-walking an earlier delay on an unrelated event', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '09:00', '11:00'),
      row('F2', 'ZZB', 'ZZA', '09:00', '10:00'),
      row('F3', 'ZZA', 'ZZB', '11:30', '12:30'),
    ])
    // Only F2's cascade is open (F3's was dismissed); a cancel elsewhere re-walks F1 but must not re-raise F3.
    tx.schedule_conflict.findMany.mockResolvedValue([openConflict('c2', 'F2', 'cascade', 'F1', 'delay-1')])

    const summary = await detector.refresh(tx as never, AIRCRAFT, { flightId: 'F9', eventId: 'cancel-1', eventType: 'cancelled' })

    expect(summary).toEqual({ opened: 0, updated: 1, superseded: 0 })
    expect(tx.schedule_conflict.create).not.toHaveBeenCalled()
  })

  it('does not raise conflicts on a flight that has departed', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '07:00', '09:00'),
      row('F2', 'ZZB', 'ZZA', '09:30', '11:00', '09:30', '11:00', { status: 'departed' }),
    ])

    await expect(detector.refresh(tx as never, AIRCRAFT, delayTrigger('F1'))).resolves.toEqual({ opened: 0, updated: 0, superseded: 0 })
  })

  it('reads through the caller transaction and uses the shared turnaround rule', async () => {
    tx.flight.findMany.mockResolvedValue([row('F1', 'ZZA', 'ZZB', '06:00', '08:00')])

    await detector.refresh(tx as never, AIRCRAFT, null)

    expect(feasibility.turnaroundResolver).toHaveBeenCalledWith(tx, AIRCRAFT, ['ZZA', 'ZZB'])
    expect(tx.flight.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { aircraft_id: AIRCRAFT, status: { not: 'cancelled' } } }),
    )
  })

  it('never moves a flight', async () => {
    tx.flight.findMany.mockResolvedValue([
      row('F1', 'ZZA', 'ZZB', '06:00', '08:00', '07:00', '09:00'),
      row('F2', 'ZZB', 'ZZA', '09:30', '11:00'),
    ])
    await detector.refresh(tx as never, AIRCRAFT, delayTrigger('F1'))
    // tx.flight has no update method here: any attempt to move a flight would throw.
    expect(tx.flight).not.toHaveProperty('update')
  })
})

describe('CascadeDetector.supersedeForFlight', () => {
  it('closes only the open conflicts this detector owns', async () => {
    const tx = { schedule_conflict: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) } }
    const detector = new CascadeDetector({} as never, { now: () => at('05:00') })

    await expect(detector.supersedeForFlight(tx as never, 'F2')).resolves.toBe(2)
    expect(tx.schedule_conflict.updateMany).toHaveBeenCalledWith({
      where: { flight_id: 'F2', kind: { in: ['cascade', 'aircraft_position'] }, status: 'open' },
      data: expect.objectContaining({ status: 'superseded' }),
    })
  })
})
