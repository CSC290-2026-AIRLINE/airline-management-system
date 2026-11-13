import 'reflect-metadata'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

import type { DbService } from '@backend/db/db.service'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { InventoryPort, PricingPort } from '../booking-pnr/contracts'
import { BookingError } from '../booking-pnr/common/booking-error'
import { SearchFlightsDto } from './dto/search-flights.dto'
import { SearchService } from './search.service'

const request: SearchFlightsDto = {
  tripType: 'one_way',
  legs: [{ origin: 'BKK', destination: 'HKT', date: '2026-11-10' }],
  adults: 1,
  children: 0,
  infants: 0,
}
const now = new Date('2026-11-09T10:00:00Z')
function flight(id = 'flight-a', hour = 12) {
  return {
    id,
    flight_number: id,
    service_date: new Date('2026-11-10T00:00:00Z'),
    dep_at: new Date(`2026-11-10T${hour}:00:00Z`),
    arr_at: new Date(`2026-11-10T${hour + 1}:30:00Z`),
    route: { origin: 'BKK', destination: 'HKT' },
    seat_inventory: [{ cabin: 'economy' }],
  }
}
function fixture(flights = [flight()]) {
  const db = {
    flight: { findMany: jest.fn(() => Promise.resolve(flights)) },
    fare_class: { findMany: jest.fn(() => Promise.resolve([{ id: 'fare-y', code: 'Y', cabin: 'economy' }])) },
  }
  const availability = jest.fn(() => Promise.resolve(flights.map((f) => ({ flightId: f.id, cabin: 'economy', seatsLeft: 12 }))))
  const quote = jest.fn(() => Promise.resolve({ fareQuoteId: null, fareClassId: 'fare-y', pricePerPassenger: 148.5, currency: 'USD' }))
  const baseCurrency = jest.fn(() => Promise.resolve('THB'))
  const service = new SearchService(
    db as unknown as DbService,
    { availability } as unknown as InventoryPort,
    { quote, baseCurrency } as unknown as PricingPort,
    { now: () => now },
  )
  return { service, db, availability, quote, baseCurrency }
}

describe('SearchService', () => {
  it('batches inventory once, carries quote ids, and preserves numeric counts above nine', async () => {
    const { service, availability, quote, baseCurrency } = fixture()
    const result = await service.search(request)
    expect(availability).toHaveBeenCalledTimes(1)
    expect(baseCurrency).toHaveBeenCalledTimes(1)
    expect(quote).toHaveBeenCalledWith({ flightId: 'flight-a', cabin: 'economy', fareClassId: 'fare-y' })
    expect(result.legs[0].options[0]).toMatchObject({
      flightId: 'flight-a',
      durationMinutes: 90,
      cabins: [{ fareClassId: 'fare-y', fareQuoteId: null, pricePerPassenger: 148.5, seatsLeft: 12, unavailableReason: null }],
    })
  })

  it('queries the local service date, saleable statuses, exact 60-minute cutoff and existing inventory', async () => {
    const { service, db } = fixture()
    await service.search(request)
    expect(db.flight.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['scheduled', 'delayed'] },
          dep_at: { gte: new Date('2026-11-09T11:00:00Z') },
          seat_inventory: { some: {} },
          OR: [{ service_date: new Date('2026-11-10T00:00:00Z'), route: { origin: 'BKK', destination: 'HKT' } }],
        },
      }),
    )
  })

  it('omits cabins below party size, excludes lap infants from seats, and never quotes an unavailable cabin', async () => {
    const { service, availability, quote } = fixture()
    availability.mockResolvedValue([{ flightId: 'flight-a', cabin: 'economy', seatsLeft: 1 }])
    expect((await service.search({ ...request, infants: 1 })).legs[0].options).toHaveLength(1)
    quote.mockClear()
    expect((await service.search({ ...request, children: 1 })).legs[0].options).toHaveLength(0)
    expect(quote).not.toHaveBeenCalled()
  })

  it('returns an empty leg without a pricing call when no flights match', async () => {
    const { service, quote, baseCurrency } = fixture([])
    expect(await service.search(request)).toEqual({ legs: [{ leg: request.legs[0], options: [] }] })
    expect(quote).not.toHaveBeenCalled()
    expect(baseCurrency).not.toHaveBeenCalled()
  })

  it('preserves a pricing rejection as an unavailable option without exposing unknown errors', async () => {
    const { service, quote, baseCurrency } = fixture()
    quote.mockRejectedValueOnce(new BookingError('BOOKING_CLOSED', 'Advance purchase window closed'))
    const unavailable = (await service.search(request)).legs[0].options[0].cabins[0]
    expect(unavailable.unavailableReason).toBe('Advance purchase window closed')
    expect(unavailable.currency).toBe('THB')
    expect(baseCurrency).toHaveBeenCalledTimes(1)
    quote.mockRejectedValueOnce(new Error('internal database details'))
    expect((await service.search(request)).legs[0].options[0].cabins[0].unavailableReason).toBe('Fare quote unavailable')
    expect(baseCurrency).toHaveBeenCalledTimes(2)
  })

  it('groups outbound and return options by leg and date', async () => {
    const inbound = { ...flight('inbound'), route: { origin: 'HKT', destination: 'BKK' } }
    const { service } = fixture([flight(), inbound])
    const result = await service.search({
      ...request,
      tripType: 'return',
      legs: [...request.legs, { origin: 'HKT', destination: 'BKK', date: '2026-11-10' }],
    })
    expect(result.legs.map((leg) => leg.options.map((option) => option.flightId))).toEqual([['flight-a'], ['inbound']])
  })

  it('sorts by price while retaining departure as a stable fallback', async () => {
    const { service, quote } = fixture([flight('later', 15), flight('early', 12)])
    quote.mockResolvedValueOnce({ fareQuoteId: null, fareClassId: 'fare-y', pricePerPassenger: 99, currency: 'USD' })
    expect((await service.search({ ...request, sortBy: 'price' })).legs[0].options.map((option) => option.flightId)).toEqual([
      'later',
      'early',
    ])
    expect((await service.search(request)).legs[0].options.map((option) => option.flightId)).toEqual(['early', 'later'])
  })

  it.each([
    { ...request, legs: [...request.legs, ...request.legs] },
    { ...request, adults: 9, children: 1 },
    { ...request, infants: 2 },
    { ...request, adults: 0 },
    { ...request, tripType: 'multi_city' as const },
    { ...request, tripType: 'return' as const, legs: [...request.legs, ...request.legs] },
    { ...request, tripType: 'return' as const, legs: [...request.legs, { origin: 'HKT', destination: 'BKK', date: '2026-11-09' }] },
  ])('rejects inconsistent trip or party before database reads: %#', async (input) => {
    const { service, db } = fixture()
    await expect(service.search(input)).rejects.toMatchObject({ status: 400 })
    expect(db.flight.findMany).not.toHaveBeenCalled()
  })
})

describe('SearchFlightsDto', () => {
  it.each([
    { ...request, adults: -1 },
    { ...request, adults: 1.5 },
    { ...request, adults: '1' },
    { ...request, legs: [{ origin: 'BKK', destination: 'HKT', date: '2026-02-30' }] },
    { ...request, legs: [{ origin: 'BKK', destination: 'HKT', date: '2026-11-10T00:00:00Z' }] },
    { ...request, legs: [{ origin: 'bkk', destination: 'HKT', date: '2026-11-10' }] },
    { ...request, tripType: 'unknown' },
    { ...request, sortBy: 'unknown' },
  ])('rejects malformed input: %#', async (input) => {
    expect(await validate(plainToInstance(SearchFlightsDto, input))).not.toHaveLength(0)
  })

  it('accepts valid search input', async () => {
    expect(await validate(plainToInstance(SearchFlightsDto, request))).toHaveLength(0)
  })
})
