import { ConflictException, ForbiddenException, InternalServerErrorException } from '@nestjs/common'
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
        cargo_shipment_event: [{ measured_weight_kg: '10.0' }],
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

    it('returns REFUND_FAILED with real error when refund throws on cancel', async () => {
      const { refundFull } = jest.requireMock('./cargo-deps')
      refundFull.mockRejectedValueOnce(new Error('provider down'))

      const err = await service.postEvent('b1', 'cancelled', 'Customer requested', 'user-1').catch((e) => e)
      expect(err).toBeInstanceOf(InternalServerErrorException)
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
