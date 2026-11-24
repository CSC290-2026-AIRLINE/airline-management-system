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

  describe('quote: flight choice', () => {
    it('gives a tie on departure to the flight with more available weight', async () => {
      runQuote.mockRestore()
      const dep = new Date('2026-11-12T01:00:00Z')
      const quoteDb = {
        cargo_setting: { findMany: jest.fn().mockResolvedValue([]) },
        cargo_prohibited_item: { findMany: jest.fn().mockResolvedValue([]) },
        cargo_commodity_type: {
          findFirst: jest.fn().mockResolvedValue({
            handling_class: 'general',
            min_weight_kg: 1,
            max_weight_kg: 5000,
            max_piece_weight_kg: 500,
          }),
        },
        flight: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'small', flight_number: 'FY1', dep_at: dep, arr_at: dep, aircraft_id: 'ac-small' },
            { id: 'big', flight_number: 'FY2', dep_at: dep, arr_at: dep, aircraft_id: 'ac-big' },
            { id: 'later', flight_number: 'FY3', dep_at: new Date(dep.getTime() + 3_600_000), arr_at: dep, aircraft_id: 'ac-big' },
          ]),
        },
        cargo_booking: { findMany: jest.fn().mockResolvedValue([]) },
        route: { findUnique: jest.fn().mockResolvedValue({ distance_km: 600 }) },
        cargo_rate: { findFirst: jest.fn().mockResolvedValue({ id: 'rate1', rate_per_kg: 1.4, min_charge: 50 }) },
      }
      // Reserve is 90 pax x 15 kg = 1350 kg: the small hold has 650 kg free, the big one 6650 kg.
      const { getAircraftCapacity } = jest.requireMock('./cargo-deps')
      getAircraftCapacity.mockImplementation((_db: unknown, id: string) =>
        Promise.resolve({ holdLimitKg: id === 'ac-small' ? 2000 : 8000, sellableSeats: 180 }),
      )
      ops.conflictingBookingRef.mockResolvedValue(null)
      const quoteService = new CargoBookingService(
        quoteDb as never,
        events as unknown as CargoEventsService,
        ops as unknown as CargoOperationsService,
      )

      const q = await quoteService.quote(INPUT)
      expect(q.flightId).toBe('big')
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
