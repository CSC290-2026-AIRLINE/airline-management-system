import type { DbService } from '@backend/db/db.service'
import { LANDED_LOOKBACK_MS, LandedFlightsService } from './landed-flights.service'

// ESM-only dependencies that Jest cannot load here; the service under test never calls into them.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('LandedFlightsService', () => {
  const now = new Date('2026-01-02T12:00:00.000Z')
  let findMany: jest.Mock
  let service: LandedFlightsService

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'f1',
    flight_number: 'TG100',
    aircraft_id: 'a1',
    arr_at: new Date('2026-01-02T11:00:00.000Z'),
    actual_destination: null,
    aircraft: { tail_number: 'HS-AAA' },
    route: { destination: 'CNX' },
    ...overrides,
  })

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([])
    service = new LandedFlightsService({ flight: { findMany } } as unknown as DbService)
  })

  it('reads the flights that arrived in the lookback window, are not cancelled and have no live turnaround', async () => {
    await service.listWaiting(now)

    const where = findMany.mock.calls[0][0].where
    expect(where.arr_at).toEqual({ gte: new Date(now.getTime() - LANDED_LOOKBACK_MS), lte: now })
    expect(where.status).toEqual({ not: 'cancelled' })
    expect(where.aircraft).toEqual({ deleted_at: null })
    expect(where.OR).toEqual([{ aircraft_turnaround: { is: null } }, { aircraft_turnaround: { deleted_at: { not: null } } }])
  })

  it('places a flight at its route destination', async () => {
    findMany.mockResolvedValue([row()])

    await expect(service.listWaiting(now)).resolves.toEqual([
      {
        flight_id: 'f1',
        flight_number: 'TG100',
        aircraft_id: 'a1',
        tail_number: 'HS-AAA',
        airport_code: 'CNX',
        arrived_at: '2026-01-02T11:00:00.000Z',
      },
    ])
  })

  it('places a diverted flight where it actually landed', async () => {
    findMany.mockResolvedValue([row({ actual_destination: 'HKT' })])

    const [flight] = await service.listWaiting(now)
    expect(flight.airport_code).toBe('HKT')
  })
})
