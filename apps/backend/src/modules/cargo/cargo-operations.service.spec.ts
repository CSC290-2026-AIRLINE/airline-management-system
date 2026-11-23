import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { CargoOperationsService } from './cargo-operations.service'
import type { CargoEventsService } from './cargo-events.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-10T12:00:00Z')
jest.mock('@backend/modules/pricing/fare-quote/sim-clock', () => ({ simNow: () => NOW }))
jest.mock('./cargo-deps', () => ({
  getAircraftCapacity: jest.fn().mockResolvedValue({ holdLimitKg: 4000, sellableSeats: 180 }),
  seatsTakenOnFlight: jest.fn().mockReturnValue(0),
}))

const HOUR = 3_600_000
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR)

interface Row {
  booking_id: string
  status: string
  hold_expires_at: Date
  flight_id: string
  flight_status: string
  dep_at: Date
  arr_at: Date
  destination: string
}

const row = (over: Partial<Row>): Row => ({
  booking_id: 'b1',
  status: 'booked',
  hold_expires_at: at(1),
  flight_id: 'f1',
  flight_status: 'scheduled',
  dep_at: at(10),
  arr_at: at(16),
  destination: 'NRT',
  ...over,
})

function setup(rows: Row[]) {
  const appendEvent = jest.fn().mockResolvedValue({ status_after: 'x' })
  const tx = {
    staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }) },
    cargo_booking: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    cargo_setting: { findMany: jest.fn().mockResolvedValue([]) },
    flight: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    cargo_handling_conflict: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  }
  const db = {
    ...tx,
    $queryRaw: jest.fn().mockResolvedValue(rows),
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    flight_event: { findFirst: jest.fn().mockResolvedValue(null) },
    cargo_shipment_event: { findFirst: jest.fn().mockResolvedValue(null) },
    cargo_handling_conflict: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn() },
  }
  const svc = new CargoOperationsService(db as never, { appendEvent } as unknown as CargoEventsService)
  return { svc, db, tx, appendEvent }
}

const calls = (appendEvent: jest.Mock) => appendEvent.mock.calls.map((c) => [c[1].eventType, c[1].actorType])

describe('CargoOperationsService.tick', () => {
  it('expires a held booking whose hold has lapsed', async () => {
    const { svc, appendEvent } = setup([row({ status: 'held', hold_expires_at: at(-0.1) })])
    expect(await svc.tick()).toEqual({ expired: 1, moved: 0 })
    expect(calls(appendEvent)).toEqual([['expired', 'system']])
  })

  it('leaves a held booking alone while its hold is running', async () => {
    const { svc, appendEvent } = setup([row({ status: 'held', hold_expires_at: at(0.2) })])
    expect(await svc.tick()).toEqual({ expired: 0, moved: 0 })
    expect(appendEvent).not.toHaveBeenCalled()
  })

  it('expires holds on a cancelled flight and cites the flight event', async () => {
    const { svc, db, appendEvent } = setup([row({ status: 'held', flight_status: 'cancelled' })])
    db.flight_event.findFirst.mockResolvedValue({ id: 'fe-1', new_destination: null })
    await svc.tick()
    expect(appendEvent.mock.calls[0][1]).toMatchObject({ eventType: 'expired', flightEventId: 'fe-1' })
  })

  it.each(['booked', 'accepted', 'loaded'])('sends a %s booking on a cancelled flight to rebook_required', async (status) => {
    const { svc, db, appendEvent } = setup([row({ status, flight_status: 'cancelled' })])
    db.flight_event.findFirst.mockResolvedValue({ id: 'fe-2', new_destination: null })
    expect(await svc.tick()).toEqual({ expired: 0, moved: 1 })
    expect(appendEvent.mock.calls[0][1]).toMatchObject({ eventType: 'flight_cancelled', actorType: 'system', flightEventId: 'fe-2' })
  })

  it('treats a diversion before departure like a cancellation', async () => {
    const { svc, db, appendEvent } = setup([row({ status: 'accepted', flight_status: 'diverted' })])
    db.flight_event.findFirst.mockResolvedValue({ id: 'fe-3', new_destination: 'HND' })
    await svc.tick()
    expect(appendEvent.mock.calls[0][1]).toMatchObject({ eventType: 'diverted', airportCode: 'HND' })
  })

  it('records an in-flight diversion once and keeps the cargo in transit', async () => {
    const first = setup([row({ status: 'in_transit', flight_status: 'diverted', dep_at: at(-3), arr_at: at(3) })])
    first.db.flight_event.findFirst.mockResolvedValue({ id: 'fe-4', new_destination: 'HND' })
    await first.svc.tick()
    expect(first.appendEvent.mock.calls[0][1]).toMatchObject({ eventType: 'diverted', flightEventId: 'fe-4', airportCode: 'HND' })

    const again = setup([row({ status: 'in_transit', flight_status: 'diverted', dep_at: at(-3), arr_at: at(3) })])
    again.db.flight_event.findFirst.mockResolvedValue({ id: 'fe-4', new_destination: 'HND' })
    again.db.cargo_shipment_event.findFirst.mockResolvedValue({ id: 'already' })
    await again.svc.tick()
    expect(again.appendEvent).not.toHaveBeenCalled()
  })

  it('departs a loaded booking and offloads booked and accepted ones when the flight has left', async () => {
    const left = { dep_at: at(-1), arr_at: at(5) }
    const { svc, appendEvent } = setup([
      row({ booking_id: 'a', status: 'loaded', ...left }),
      row({ booking_id: 'b', status: 'booked', ...left }),
      row({ booking_id: 'c', status: 'accepted', ...left }),
    ])
    await svc.tick()
    expect(calls(appendEvent)).toEqual([
      ['departed', 'system'],
      ['offloaded', 'system'],
      ['offloaded', 'system'],
    ])
  })

  it('does not depart a booking before its flight leaves', async () => {
    const { svc, appendEvent } = setup([row({ status: 'loaded', dep_at: at(2) })])
    await svc.tick()
    expect(appendEvent).not.toHaveBeenCalled()
  })

  it('lands an in-transit booking at the destination, or at the diversion airport', async () => {
    const landed = { status: 'in_transit', dep_at: at(-8), arr_at: at(-1) }
    const normal = setup([row(landed)])
    await normal.svc.tick()
    expect(normal.appendEvent.mock.calls[0][1]).toMatchObject({ eventType: 'arrived', airportCode: 'NRT' })

    const diverted = setup([row(landed)])
    diverted.db.flight_event.findFirst.mockResolvedValue({ id: 'fe-5', new_destination: 'HND' })
    await diverted.svc.tick()
    expect(diverted.appendEvent.mock.calls[0][1]).toMatchObject({ eventType: 'arrived', airportCode: 'HND' })
  })

  it('skips a booking that moved at the same moment and carries on with the rest', async () => {
    const { svc, appendEvent } = setup([
      row({ booking_id: 'a', status: 'held', hold_expires_at: at(-1) }),
      row({ booking_id: 'b', status: 'held', hold_expires_at: at(-1) }),
    ])
    appendEvent.mockRejectedValueOnce(new ConflictException()).mockResolvedValueOnce({})
    expect(await svc.tick()).toEqual({ expired: 1, moved: 0 })
    expect(appendEvent).toHaveBeenCalledTimes(2)
  })
})

describe('CargoOperationsService.moveToFlight', () => {
  const booking = (over: Record<string, unknown> = {}) => ({
    id: 'b1',
    route_id: 'r1',
    flight_id: 'f1',
    handling_class: 'general',
    declared_weight_kg: '100',
    cargo_shipment_event: [
      { status_after: 'rebook_required', event_type: 'flight_cancelled', measured_weight_kg: null },
      { status_after: 'accepted', event_type: 'accepted', measured_weight_kg: '120' },
    ],
    ...over,
  })
  const flight = (over: Record<string, unknown> = {}) => ({
    id: 'f2',
    route_id: 'r1',
    status: 'scheduled',
    dep_at: at(20),
    aircraft_id: 'ac1',
    ...over,
  })

  it('needs a staff account', async () => {
    const { svc, tx } = setup([])
    tx.staff.findFirst.mockResolvedValue(null)
    await expect(svc.moveToFlight('b1', 'f2', undefined, 'u1')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a booking that does not need a new flight', async () => {
    const { svc, tx } = setup([])
    tx.cargo_booking.findUnique.mockResolvedValue(
      booking({ cargo_shipment_event: [{ status_after: 'booked', event_type: 'confirmed', measured_weight_kg: null }] }),
    )
    await expect(svc.moveToFlight('b1', 'f2', undefined, 'u1')).rejects.toMatchObject({
      response: { error: { code: 'INVALID_TRANSITION' } },
    })
  })

  it('refuses an unknown flight, another route and a closed flight', async () => {
    const { svc, tx } = setup([])
    tx.cargo_booking.findUnique.mockResolvedValue(booking())
    tx.flight.findUnique.mockResolvedValueOnce(null)
    await expect(svc.moveToFlight('b1', 'f2', undefined, 'u1')).rejects.toBeInstanceOf(NotFoundException)

    tx.flight.findUnique.mockResolvedValueOnce(flight({ route_id: 'other' }))
    await expect(svc.moveToFlight('b1', 'f2', undefined, 'u1')).rejects.toMatchObject({ response: { error: { code: 'INVALID_FLIGHT' } } })

    tx.flight.findUnique.mockResolvedValueOnce(flight({ dep_at: at(2) }))
    await expect(svc.moveToFlight('b1', 'f2', undefined, 'u1')).rejects.toMatchObject({ response: { error: { code: 'FLIGHT_CLOSED' } } })

    tx.flight.findUnique.mockResolvedValueOnce(flight({ status: 'cancelled' }))
    await expect(svc.moveToFlight('b1', 'f2', undefined, 'u1')).rejects.toMatchObject({ response: { error: { code: 'FLIGHT_CLOSED' } } })
  })

  it('refuses a flight without room, using the measured weight', async () => {
    const { svc, tx } = setup([])
    tx.cargo_booking.findUnique.mockResolvedValue(booking())
    tx.flight.findUnique.mockResolvedValue(flight())
    // 4000 kg hold - 90 passengers x 15 kg = 2650 free; 2600 already committed leaves 50 for a 120 kg booking
    tx.cargo_booking.findMany.mockResolvedValue([
      { declared_weight_kg: '2600', cargo_shipment_event: [{ status_after: 'booked', measured_weight_kg: null }] },
    ])
    await expect(svc.moveToFlight('b1', 'f2', undefined, 'u1')).rejects.toMatchObject({
      response: { error: { code: 'CAPACITY_EXCEEDED', details: { available_kg: 50 } } },
    })
  })

  it('refuses goods that may not share the flight', async () => {
    const { svc, tx } = setup([])
    tx.cargo_booking.findUnique.mockResolvedValue(booking({ handling_class: 'dangerous' }))
    tx.flight.findUnique.mockResolvedValue(flight())
    tx.cargo_handling_conflict.findMany.mockResolvedValue([{ handling_class_a: 'dangerous', handling_class_b: 'live_animal', reason: 'x' }])
    tx.cargo_booking.findMany
      .mockResolvedValueOnce([]) // committed weight on the flight
      .mockResolvedValueOnce([{ booking_ref: 'CG-LIVE', cargo_shipment_event: [{ status_after: 'booked' }] }])
    await expect(svc.moveToFlight('b1', 'f2', undefined, 'u1')).rejects.toMatchObject({
      response: { error: { code: 'HANDLING_CONFLICT', details: { booking_ref: 'CG-LIVE' } } },
    })
  })

  it('moves an accepted booking back to accepted and a never-accepted one to booked', async () => {
    const accepted = setup([])
    accepted.tx.cargo_booking.findUnique.mockResolvedValue(booking())
    accepted.tx.flight.findUnique.mockResolvedValue(flight())
    await accepted.svc.moveToFlight('b1', 'f2', 'new flight', 'u1')
    expect(accepted.tx.$executeRaw).toHaveBeenCalledTimes(2) // flight lock, then the update
    expect(accepted.appendEvent.mock.calls[0][1]).toMatchObject({
      eventType: 'flight_changed',
      actorType: 'staff',
      staffId: 'staff-1',
      statusAfter: 'accepted',
      note: 'new flight',
    })

    const fresh = setup([])
    fresh.tx.cargo_booking.findUnique.mockResolvedValue(
      booking({ cargo_shipment_event: [{ status_after: 'rebook_required', event_type: 'offloaded', measured_weight_kg: null }] }),
    )
    fresh.tx.flight.findUnique.mockResolvedValue(flight())
    await fresh.svc.moveToFlight('b1', 'f2', undefined, 'u1')
    expect(fresh.appendEvent.mock.calls[0][1]).toMatchObject({ statusAfter: 'booked' })
  })
})

describe('CargoOperationsService.conflictingBookingRef', () => {
  it('finds nothing when the class has no conflict rows', async () => {
    const { svc, db } = setup([])
    expect(await svc.conflictingBookingRef(db as never, 'f1', 'general')).toBeNull()
  })

  it('ignores a booking that is already in transit or cancelled', async () => {
    const { svc, db } = setup([])
    db.cargo_handling_conflict.findMany.mockResolvedValue([{ handling_class_a: 'dangerous', handling_class_b: 'live_animal', reason: 'x' }])
    ;(db as unknown as { cargo_booking: { findMany: jest.Mock } }).cargo_booking.findMany.mockResolvedValue([
      { booking_ref: 'CG-GONE', cargo_shipment_event: [{ status_after: 'cancelled' }] },
    ])
    expect(await svc.conflictingBookingRef(db as never, 'f1', 'dangerous')).toBeNull()
  })
})

describe('CargoOperationsService.addHandlingConflict', () => {
  it('rejects a class paired with itself and a pair that is already listed', async () => {
    const { svc, db } = setup([])
    await expect(svc.addHandlingConflict('general', 'general', 'x')).rejects.toBeInstanceOf(ConflictException)
    db.cargo_handling_conflict.findFirst.mockResolvedValue({ handling_class_a: 'a', handling_class_b: 'b' })
    await expect(svc.addHandlingConflict('b', 'a', 'x')).rejects.toBeInstanceOf(ConflictException)
  })

  it('stores a new pair in a fixed order', async () => {
    const { svc, db } = setup([])
    db.cargo_handling_conflict.findFirst.mockResolvedValue(null)
    await svc.addHandlingConflict('live_animal', 'dangerous', 'no mix')
    expect(db.cargo_handling_conflict.create).toHaveBeenCalledWith({
      data: { handling_class_a: 'dangerous', handling_class_b: 'live_animal', reason: 'no mix' },
    })
  })
})
