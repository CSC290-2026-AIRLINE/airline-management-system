import { BaggageFlightService } from './baggage-flight.service'
import type { DbService } from '@backend/db/db.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-21T00:00:00Z')

function row(actualDestination: string | null = null) {
  return {
    id: FLIGHT_ID,
    flight_number: 'FY 204',
    service_date: new Date('2026-10-20T00:00:00Z'),
    arr_at: new Date('2026-10-20T08:00:00Z'),
    dep_at: new Date('2026-10-20T06:35:00Z'),
    actual_destination: actualDestination,
    route: { origin: 'BKK', destination: 'HKT' },
  }
}

function makeSvc() {
  const db = {
    flight: {
      findMany: jest.fn().mockResolvedValue([row()]),
      findUnique: jest.fn().mockResolvedValue(row()),
    },
  }

  return { svc: new BaggageFlightService(db as unknown as DbService, { now: () => NOW }), db }
}

describe('BaggageFlightService', () => {
  it('lists recent arrivals at an airport, counting a diverted flight where it landed', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.arrivalsAt('hkt')).resolves.toEqual([
      expect.objectContaining({ id: FLIGHT_ID, flightNumber: 'FY 204', origin: 'BKK', destination: 'HKT' }),
    ])

    const query = db.flight.findMany.mock.calls[0][0]
    expect(query.where.OR).toEqual([{ actual_destination: 'HKT' }, { actual_destination: null, route: { destination: 'HKT' } }])
    expect(query.where.arr_at.gte).toEqual(new Date('2026-10-18T00:00:00Z'))
    expect(query.where.arr_at.lte).toEqual(new Date('2026-10-22T00:00:00Z'))
    expect(query.where.status).toEqual({ not: 'cancelled' })
    expect(query.orderBy).toEqual({ arr_at: 'desc' })
  })

  it('lists flights leaving an airport for a destination, soonest first', async () => {
    const { svc, db } = makeSvc()

    await svc.departuresFrom('bkk', 'hkt')

    const query = db.flight.findMany.mock.calls[0][0]
    expect(query.where.route).toEqual({ origin: 'BKK' })
    expect(query.where.OR).toEqual([
      { actual_destination: 'HKT' },
      { actual_destination: null, route: { origin: 'BKK', destination: 'HKT' } },
    ])
    expect(query.where.dep_at.gte).toEqual(new Date('2026-10-20T00:00:00Z'))
    expect(query.where.dep_at.lte).toEqual(new Date('2026-10-24T00:00:00Z'))
    expect(query.orderBy).toEqual({ dep_at: 'asc' })
  })

  it('lists every departure when no destination is given, and refuses a bad code', async () => {
    const { svc, db } = makeSvc()

    await svc.departuresFrom('BKK')
    expect(db.flight.findMany.mock.calls[0][0].where.OR).toBeUndefined()

    await expect(svc.departuresFrom('BKK', 'Phuket')).rejects.toMatchObject({ code: 'INVALID_FOUND_BAG' })
    expect(db.flight.findMany).toHaveBeenCalledTimes(1)
  })

  it('names the diversion airport as the destination of a diverted flight', async () => {
    const { svc, db } = makeSvc()
    db.flight.findUnique.mockResolvedValue(row('CNX'))

    await expect(svc.get(FLIGHT_ID)).resolves.toMatchObject({ origin: 'BKK', destination: 'CNX' })
  })

  it('refuses a bad airport code without querying', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.arrivalsAt('Bangkok')).rejects.toMatchObject({ code: 'INVALID_FOUND_BAG', status: 400 })
    expect(db.flight.findMany).not.toHaveBeenCalled()
  })

  it('reports a missing flight, and a bad id without querying', async () => {
    const { svc, db } = makeSvc()
    db.flight.findUnique.mockResolvedValue(null)

    await expect(svc.get(FLIGHT_ID)).rejects.toMatchObject({ code: 'FLIGHT_NOT_FOUND', status: 404 })
    await expect(svc.get('FY204')).rejects.toMatchObject({ code: 'FLIGHT_NOT_FOUND' })
    expect(db.flight.findUnique).toHaveBeenCalledTimes(1)
  })
})
