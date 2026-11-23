import { ConflictException } from '@nestjs/common'
import { CargoBookingService, type BookingInput } from './cargo-booking.service'
import type { CargoEventsService } from './cargo-events.service'
import type { CargoOperationsService } from './cargo-operations.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-10T12:00:00Z')
jest.mock('@backend/modules/pricing/fare-quote/sim-clock', () => ({ simNow: () => NOW }))

jest.mock('./cargo-deps', () => ({
  getAircraftCapacity: jest.fn().mockResolvedValue({ holdLimitKg: 4000, sellableSeats: 180 }),
  seatsTakenOnFlight: jest.fn().mockResolvedValue(0),
  awbPrefix: jest.fn().mockReturnValue('999'),
}))

const INPUT: BookingInput = {
  routeId: 'r1',
  shipDate: '2026-11-12',
  commodityTypeId: 'ct1',
  goodsDescription: 'Fresh orchids',
  pieces: 2,
  declaredWeightKg: 100,
  declaredVolumeM3: 0.5,
  shipperName: 'Shipper',
  consigneeName: 'Consignee',
  consigneeAddress: 'Somewhere',
}

const quoteFor = (flightId: string) => ({
  flightId,
  flightNumber: 'FL1',
  depAt: NOW,
  arrAt: NOW,
  routeId: 'r1',
  distanceKm: 1000,
  commodityTypeId: 'ct1',
  handlingClass: 'perishable',
  chargeableKg: 100,
  rateId: 'rate1',
  ratePerKg: 2,
  minCharge: 50,
  charge: 200,
  currency: 'USD',
})

function makeTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn(),
    cargo_setting: { findMany: jest.fn().mockResolvedValue([]) },
    cargo_booking: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new-booking' }),
      update: jest.fn().mockResolvedValue({}),
    },
    flight: { findUnique: jest.fn().mockResolvedValue({ aircraft_id: 'ac-1' }) },
  }
}

describe('CargoBookingService', () => {
  let tx: ReturnType<typeof makeTx>
  let ops: { conflictingBookingRef: jest.Mock }
  let events: { appendEvent: jest.Mock }
  let service: CargoBookingService
  let runQuote: jest.SpyInstance

  beforeEach(() => {
    tx = makeTx()
    const db = { $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)) }
    ops = { conflictingBookingRef: jest.fn() }
    events = { appendEvent: jest.fn().mockResolvedValue({ status_after: 'held' }) }
    service = new CargoBookingService(db as never, events as unknown as CargoEventsService, ops as unknown as CargoOperationsService)
    runQuote = jest.spyOn(CargoBookingService.prototype as unknown as { runQuote: () => Promise<unknown> }, 'runQuote')
  })

  afterEach(() => runQuote.mockRestore())

  describe('createHeldBooking', () => {
    it('quotes again and takes the next flight when a clashing booking lands between the quote and the lock', async () => {
      runQuote.mockResolvedValueOnce(quoteFor('flight-A')).mockResolvedValueOnce(quoteFor('flight-B'))
      ops.conflictingBookingRef.mockImplementation((_tx: unknown, flightId: string) => (flightId === 'flight-A' ? 'CG-DANGER' : null))

      await service.createHeldBooking('cust-1', INPUT)
      expect(runQuote).toHaveBeenCalledTimes(2)
      expect(tx.cargo_booking.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ flight_id: 'flight-B' }) }),
      )
    })

    it('refuses with HANDLING_CONFLICT only once every attempt clashed', async () => {
      runQuote.mockResolvedValue(quoteFor('flight-A'))
      ops.conflictingBookingRef.mockResolvedValue('CG-DANGER')

      const err = await service.createHeldBooking('cust-1', INPUT).catch((e) => e)
      expect(err).toBeInstanceOf(ConflictException)
      expect(err.response.error.code).toBe('HANDLING_CONFLICT')
      expect(runQuote).toHaveBeenCalledTimes(3)
      expect(tx.cargo_booking.create).not.toHaveBeenCalled()
    })
  })

  describe('confirmCargoBooking', () => {
    it('takes the AWB advisory lock before reading the next serial', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([
          { id: 'b1', quoted_charge: '200.00', hold_expires_at: new Date(NOW.getTime() + 60_000), payment_id: null, awb_number: null },
        ])
        .mockResolvedValueOnce([{ next_serial: 42 }])

      const result = await service.confirmCargoBooking('CG-ABCDEF', 'pay-1', 200)

      expect(result.awbNumber).toBe('99900000420')
      const lockCall = tx.$executeRaw.mock.calls.findIndex(([sql]: [TemplateStringsArray]) => sql.join('').includes('cargo-awb-serial'))
      expect(lockCall).toBeGreaterThanOrEqual(0)
      expect(tx.$executeRaw.mock.invocationCallOrder[lockCall]).toBeLessThan(tx.$queryRaw.mock.invocationCallOrder[1])
    })
  })
})
