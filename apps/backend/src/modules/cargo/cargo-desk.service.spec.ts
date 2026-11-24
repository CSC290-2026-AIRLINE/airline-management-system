import { ConflictException, ForbiddenException } from '@nestjs/common'
import { CargoDeskService } from './cargo-desk.service'
import { CargoEventsService } from './cargo-events.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-10T12:00:00Z')

jest.mock('@backend/modules/pricing/fare-quote/sim-clock', () => ({
  simNow: () => NOW,
}))

jest.mock('./cargo-deps', () => ({
  getAircraftCapacity: jest.fn().mockResolvedValue({ holdLimitKg: 4000, sellableSeats: 180 }),
  seatsTakenOnFlight: jest.fn().mockReturnValue(0),
  refundFull: jest.fn().mockResolvedValue({ refundId: 'refund-1' }),
  refundFailed: (what: 'cancellation' | 'rejection', cause: unknown) =>
    jest.requireActual<typeof import('./cargo-deps')>('./cargo-deps').refundFailed(what, cause),
  loadedBaggageKg: jest.fn().mockReturnValue(null),
}))

function makeTx() {
  return {
    cargo_booking: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cargo_setting: {
      findMany: jest.fn().mockResolvedValue([
        { key: 'baggage_reserve_kg_per_passenger', value: '15' },
        { key: 'baggage_reserve_floor_percent', value: '50' },
        { key: 'volumetric_kg_per_m3', value: '167' },
        { key: 'weight_tolerance_percent', value: '10' },
      ]),
    },
    cargo_shipment_event: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cargo_notice: { create: jest.fn() },
    staff: {
      findFirst: jest.fn(),
    },
    flight: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  }
}

function makeDb() {
  const tx = makeTx()
  return {
    ...tx,
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  }
}

function makeEventsService() {
  return {
    appendEvent: jest.fn().mockResolvedValue({ status_after: 'accepted', id: 'evt-1' }),
    currentStatus: jest.fn(),
    lockedStatus: jest.fn().mockResolvedValue('booked'),
    assertTransition: jest.fn().mockResolvedValue(undefined),
  }
}

describe('CargoDeskService', () => {
  let service: CargoDeskService
  let db: ReturnType<typeof makeDb>
  let events: ReturnType<typeof makeEventsService>

  beforeEach(() => {
    db = makeDb()
    events = makeEventsService()
    service = new CargoDeskService(db as never, events as unknown as CargoEventsService)
  })

  function seedStaff(staffId = 'staff-1') {
    const tx = db as unknown as ReturnType<typeof makeTx>
    tx.staff.findFirst.mockResolvedValue({ id: staffId })
  }

  describe('acceptBooking', () => {
    it('passes staffId to appendEvent', async () => {
      seedStaff('staff-42')
      const result = await service.acceptBooking('b1', 10, 0.06, 'user-1')
      expect(events.appendEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ staffId: 'staff-42', actorType: 'staff', eventType: 'accepted' }),
      )
      expect(result.status).toBe('accepted')
    })

    it('returns 403 when user has no staff account', async () => {
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.staff.findFirst.mockResolvedValue(null)

      await expect(service.acceptBooking('b1', 10, 0.06, 'user-no-staff')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('rejectBooking', () => {
    beforeEach(() => {
      seedStaff()
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.cargo_booking.findUnique.mockResolvedValue({
        id: 'b1',
        booking_ref: 'CB-000001',
        payment_id: 'pay-1',
        quoted_chargeable_kg: '10.0',
        quoted_charge: '100.00',
      })
      events.appendEvent.mockResolvedValue({ status_after: 'rejected', id: 'evt-2' })
    })

    it('passes staffId to appendEvent', async () => {
      await service.rejectBooking('b1', 50, 0.3, 'Too heavy', 'user-1')
      expect(events.appendEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ staffId: 'staff-1', actorType: 'staff', eventType: 'rejected' }),
      )
    })

    it('returns 403 when user has no staff account', async () => {
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.staff.findFirst.mockResolvedValue(null)

      await expect(service.rejectBooking('b1', 50, 0.3, 'Too heavy', 'user-no-staff')).rejects.toThrow(ForbiddenException)
    })

    it('rejects when measured weight is within tolerance', async () => {
      await expect(service.rejectBooking('b1', 10, 0.06, 'Too heavy', 'user-1')).rejects.toThrow(ConflictException)
    })

    it('refuses with 409, without starting a refund, when the transition is not allowed', async () => {
      const { refundFull } = jest.requireMock('./cargo-deps')
      refundFull.mockClear()
      events.lockedStatus.mockResolvedValue('accepted')
      events.assertTransition.mockRejectedValue(new ConflictException('INVALID_TRANSITION'))

      await expect(service.rejectBooking('b1', 50, 0.3, 'Too heavy', 'user-1')).rejects.toThrow(ConflictException)
      expect(refundFull).not.toHaveBeenCalled()
    })

    it('refuses with 409, without starting a refund, when the booking was never paid', async () => {
      const { refundFull } = jest.requireMock('./cargo-deps')
      refundFull.mockClear()
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.cargo_booking.findUnique.mockResolvedValue({
        booking_ref: 'CB-000001',
        payment_id: null,
        quoted_chargeable_kg: '10.0',
        quoted_charge: '100.00',
      })

      await expect(service.rejectBooking('b1', 50, 0.3, 'Too heavy', 'user-1')).rejects.toThrow(ConflictException)
      expect(refundFull).not.toHaveBeenCalled()
    })
  })

  describe('postEvent', () => {
    beforeEach(() => {
      seedStaff()
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.cargo_booking.findUnique.mockResolvedValue({
        id: 'b1',
        booking_ref: 'CB-000001',
        flight_id: 'f1',
        payment_id: 'pay-1',
        quoted_charge: '100.00',
        declared_weight_kg: '10.0',
        cargo_shipment_event: [{ status_after: 'accepted', event_type: 'accepted', measured_weight_kg: '10.0' }],
      })
      events.appendEvent.mockResolvedValue({ status_after: 'loaded', id: 'evt-3' })
    })

    it('passes staffId to appendEvent for loaded', async () => {
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.flight.findUnique.mockResolvedValue({ aircraft_id: 'ac-1' })

      await service.postEvent('b1', 'loaded', undefined, 'user-1')
      expect(events.appendEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ staffId: 'staff-1', actorType: 'staff', eventType: 'loaded' }),
      )
    })

    it('passes staffId to appendEvent for cancelled', async () => {
      events.appendEvent.mockResolvedValue({ status_after: 'cancelled', id: 'evt-4' })

      await service.postEvent('b1', 'cancelled', 'Customer requested', 'user-1')
      expect(events.appendEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ staffId: 'staff-1', actorType: 'staff', eventType: 'cancelled', refundId: 'refund-1' }),
      )
    })

    it('returns 403 when user has no staff account', async () => {
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.staff.findFirst.mockResolvedValue(null)

      await expect(service.postEvent('b1', 'loaded', undefined, 'user-no-staff')).rejects.toThrow(ForbiddenException)
    })

    it('checks the hold against the aircraft of the flight, not the flight id', async () => {
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.flight.findUnique.mockResolvedValue({ aircraft_id: 'ac-1' })
      const { getAircraftCapacity } = jest.requireMock('./cargo-deps')
      getAircraftCapacity.mockClear()

      await service.postEvent('b1', 'loaded', undefined, 'user-1')
      const lockSql = tx.$executeRaw.mock.calls.map((c) => [...(c[0] as TemplateStringsArray), ...c.slice(1)].join(''))
      expect(lockSql.some((sql) => sql.includes('pg_advisory_xact_lock') && sql.includes('cargo-flight:f1'))).toBe(true)
      expect(getAircraftCapacity).toHaveBeenCalledWith(expect.anything(), 'ac-1')
      expect(getAircraftCapacity).not.toHaveBeenCalledWith(expect.anything(), 'f1')
    })

    it('loads by the measured weight even when a later event (a flight move) carries none', async () => {
      // Hold 4000 kg, reserve 90 pax x 15 kg = 1350 kg, nothing else committed: 2650 kg free. Declared 500 kg would fit; the
      // 3000 kg measured at acceptance does not.
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.flight.findUnique.mockResolvedValue({ aircraft_id: 'ac-1' })
      tx.cargo_booking.findUnique.mockResolvedValue({
        id: 'b1',
        booking_ref: 'CB-000001',
        flight_id: 'f1',
        payment_id: 'pay-1',
        quoted_charge: '100.00',
        declared_weight_kg: '500.0',
        cargo_shipment_event: [
          { status_after: 'accepted', event_type: 'flight_changed', measured_weight_kg: null },
          { status_after: 'rebook_required', event_type: 'offloaded', measured_weight_kg: null },
          { status_after: 'accepted', event_type: 'accepted', measured_weight_kg: '3000.0' },
        ],
      })

      const err = await service.postEvent('b1', 'loaded', undefined, 'user-1').catch((e) => e)
      expect(err).toBeInstanceOf(ConflictException)
      expect(err.response.error.code).toBe('CAPACITY_EXCEEDED')
    })

    it('refunds a staff cancel after a flight cancellation with the flight reason', async () => {
      const { refundFull } = jest.requireMock('./cargo-deps')
      refundFull.mockClear()
      events.lockedStatus.mockResolvedValue('rebook_required')
      events.appendEvent.mockResolvedValue({ status_after: 'cancelled', id: 'evt-5' })
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.cargo_booking.findUnique.mockResolvedValue({
        id: 'b1',
        booking_ref: 'CB-000001',
        flight_id: 'f1',
        payment_id: 'pay-1',
        quoted_charge: '100.00',
        declared_weight_kg: '10.0',
        cargo_shipment_event: [{ status_after: 'rebook_required', event_type: 'flight_cancelled', measured_weight_kg: null }],
      })

      await service.postEvent('b1', 'cancelled', 'Flight cancelled', 'user-1')
      expect(refundFull).toHaveBeenCalledWith(expect.anything(), 'CB-000001', 'pay-1', 100, 'flight')
    })

    it('refunds a staff cancel of an offloaded booking as an ordinary cancel', async () => {
      const { refundFull } = jest.requireMock('./cargo-deps')
      refundFull.mockClear()
      events.lockedStatus.mockResolvedValue('rebook_required')
      events.appendEvent.mockResolvedValue({ status_after: 'cancelled', id: 'evt-6' })
      const tx = db as unknown as ReturnType<typeof makeTx>
      tx.cargo_booking.findUnique.mockResolvedValue({
        id: 'b1',
        booking_ref: 'CB-000001',
        flight_id: 'f1',
        payment_id: 'pay-1',
        quoted_charge: '100.00',
        declared_weight_kg: '10.0',
        cargo_shipment_event: [{ status_after: 'rebook_required', event_type: 'offloaded', measured_weight_kg: null }],
      })

      await service.postEvent('b1', 'cancelled', 'Missed the flight', 'user-1')
      expect(refundFull).toHaveBeenCalledWith(expect.anything(), 'CB-000001', 'pay-1', 100, 'cancel')
    })

    it('refuses to cancel an unpaid held booking with 409 and starts no refund', async () => {
      const { refundFull } = jest.requireMock('./cargo-deps')
      refundFull.mockClear()
      events.lockedStatus.mockResolvedValue('held')
      events.assertTransition.mockRejectedValue(new ConflictException('INVALID_TRANSITION'))

      await expect(service.postEvent('b1', 'cancelled', 'Customer requested', 'user-1')).rejects.toThrow(ConflictException)
      expect(events.assertTransition).toHaveBeenCalledWith(expect.anything(), 'held', 'cancelled', 'staff')
      expect(refundFull).not.toHaveBeenCalled()
    })

    it('returns REFUND_FAILED with real error when refund throws on cancel', async () => {
      const { refundFull } = jest.requireMock('./cargo-deps')
      refundFull.mockRejectedValueOnce(new Error('provider down'))

      const err = await service.postEvent('b1', 'cancelled', 'Customer requested', 'user-1').catch((e) => e)
      expect(err.getStatus()).toBe(502)
      expect(err.response.error.message).toContain('provider down')
    })
  })
})

describe('CargoEventsService check constraint handling', () => {
  it('wraps PostgreSQL 23514 check constraint error as 400', async () => {
    const db = { staff: { findFirst: jest.fn() } }
    const eventsService = new CargoEventsService(db as never)

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'b1', booking_ref: 'CB-000001', flight_id: 'f1' }]),
      cargo_shipment_event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prev-1', status_after: 'booked' }),
        create: jest.fn().mockRejectedValue({ code: '23514' }),
      },
      cargo_status_transition: {
        findFirst: jest.fn().mockResolvedValue({ status_after: 'accepted' }),
      },
    }

    await expect(
      eventsService.appendEvent(tx as never, {
        bookingId: 'b1',
        eventType: 'accepted',
        actorType: 'staff',
        measuredWeightKg: 10,
        measuredVolumeM3: 0.06,
        measuredChargeableKg: 10,
      }),
    ).rejects.toThrow(expect.objectContaining({ status: 400 }))
  })
})

describe('CargoDeskService CSV exports', () => {
  const service = new CargoDeskService(makeDb() as never, makeEventsService() as unknown as CargoEventsService)

  const row = (over: Record<string, unknown> = {}) => ({
    id: 'b1',
    bookingRef: 'CG-AAAAAA',
    awbNumber: '99900000103',
    shipperName: 'Thai Orchid, Ltd.',
    consigneeName: 'Say "hi" Co',
    flightNumber: 'FL501',
    flightServiceDate: new Date('2026-11-27T00:00:00Z'),
    flightDepAt: new Date('2026-11-27T06:22:00Z'),
    flightOrigin: 'BKK',
    flightDestination: 'NRT',
    commodityTypeName: 'General cargo',
    pieces: 3,
    quotedChargeableKg: 263,
    quotedCharge: 683.8,
    currency: 'USD',
    status: 'booked',
    bookedAt: new Date('2026-11-23T12:18:00Z'),
    hasRefund: false,
    ...over,
  })

  it('writes the bookings list with a header, hyphenated AWBs and quoted commas and quotes', () => {
    const csv = service.bookingsToCsv([row(), row({ bookingRef: 'CG-BBBBBB', awbNumber: null })])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Booking,AWB,Shipper,Consignee,Flight,Ship date,Commodity,Pieces,Chargeable kg,Charge,Currency,Status,Booked at')
    expect(lines[1]).toBe(
      'CG-AAAAAA,999-0000010-3,"Thai Orchid, Ltd.","Say ""hi"" Co",FL501,2026-11-27,General cargo,3,263.0,683.80,USD,booked,2026-11-23T12:18:00.000Z',
    )
    expect(lines[2].startsWith('CG-BBBBBB,,')).toBe(true)
    expect(lines).toHaveLength(3)
  })

  it('writes only the header for an empty list', () => {
    expect(service.bookingsToCsv([])).toBe(
      'Booking,AWB,Shipper,Consignee,Flight,Ship date,Commodity,Pieces,Chargeable kg,Charge,Currency,Status,Booked at',
    )
  })
})

describe('CargoEventsService confirmed notice', () => {
  it('names the Air Waybill, the flight and the local departure time', async () => {
    const eventsService = new CargoEventsService({} as never)
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 'b1',
          booking_ref: 'CG-MFHYSH',
          flight_id: 'f1',
          quoted_charge: '280.70',
          currency: 'USD',
          awb_number: '99900000151',
          flight_number: 'FY101',
          dep_at: new Date('2026-11-25T01:00:00Z'),
          origin_timezone: 'Asia/Bangkok',
        },
      ]),
      cargo_shipment_event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prev-1', status_after: 'held' }),
        create: jest.fn().mockResolvedValue({ id: 'evt-1', status_after: 'booked' }),
      },
      cargo_status_transition: { findFirst: jest.fn().mockResolvedValue({ status_after: 'booked' }) },
      cargo_notice: { create: jest.fn() },
    }

    await eventsService.appendEvent(tx as never, { bookingId: 'b1', eventType: 'confirmed', actorType: 'system' })

    const { message } = tx.cargo_notice.create.mock.calls[0][0].data
    expect(message).toContain('999-0000015-1')
    expect(message).toContain('FY101')
    expect(message).toContain('25 Nov 2026, 08:00') // 01:00 UTC is 08:00 in Bangkok
  })
})
