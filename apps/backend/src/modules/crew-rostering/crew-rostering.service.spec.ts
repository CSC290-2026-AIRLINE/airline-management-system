import { NotFoundException } from '@nestjs/common'
import { CrewRosteringService } from './crew-rostering.service'
import type { ScheduleQuery } from './dto/schedule-query.dto'

// The real DbService extends the generated Prisma client, which Jest cannot load here; the service under test never reaches it.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const BKK_QUERY: ScheduleQuery = { dateFrom: '2026-09-15', dateTo: '2026-09-17', base: 'BKK' }

/** 12:30 local in Bangkok on 15 Sep. */
const DEP_15SEP = new Date('2026-09-15T05:30:00.000Z')
/** 08:00 local in Bangkok on 18 Sep — past `dateTo`, so it must not come back. */
const DEP_18SEP = new Date('2026-09-18T01:00:00.000Z')

describe('CrewRosteringService.listBases', () => {
  let db: { airport: { findMany: jest.Mock } }
  let service: CrewRosteringService

  beforeEach(() => {
    db = {
      airport: {
        findMany: jest.fn().mockResolvedValue([
          { iata_code: 'BKK', name: 'Suvarnabhumi', timezone: 'Asia/Bangkok' },
          { iata_code: 'DMK', name: 'Don Mueang', timezone: 'Asia/Bangkok' },
        ]),
      },
    }
    service = new CrewRosteringService(db as any)
  })

  it('returns active airports in the camelCase shape the page expects', async () => {
    await expect(service.listBases()).resolves.toEqual([
      { iataCode: 'BKK', name: 'Suvarnabhumi', timezone: 'Asia/Bangkok' },
      { iataCode: 'DMK', name: 'Don Mueang', timezone: 'Asia/Bangkok' },
    ])
    expect(db.airport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true } }))
  })
})

describe('CrewRosteringService.findPairingPool', () => {
  let db: {
    airport: { findMany: jest.Mock; findUnique: jest.Mock }
    route: { findMany: jest.Mock }
    flight: { findMany: jest.Mock }
  }
  let service: CrewRosteringService

  beforeEach(() => {
    db = {
      airport: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ iata_code: 'BKK', timezone: 'Asia/Bangkok' }),
      },
      route: { findMany: jest.fn().mockResolvedValue([]) },
      flight: { findMany: jest.fn().mockResolvedValue([]) },
    }
    service = new CrewRosteringService(db as any)
  })

  it('rejects a base that is not an airport', async () => {
    db.airport.findUnique.mockResolvedValue(null)

    await expect(service.findPairingPool(BKK_QUERY)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.flight.findMany).not.toHaveBeenCalled()
  })

  it('asks the database to skip flights that cannot be crewed', async () => {
    await service.findPairingPool(BKK_QUERY)

    expect(db.flight.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { notIn: ['cancelled', 'diverted'] } }) }),
    )
  })

  it('returns flights as ISO-8601 UTC instants in the order the database gave them', async () => {
    db.flight.findMany.mockResolvedValue([
      {
        id: 'f1',
        flight_number: 'FD210',
        scheduled_dep_at: DEP_15SEP,
        scheduled_arr_at: new Date('2026-09-15T11:30:00.000Z'),
        route: { origin: 'BKK', destination: 'NRT' },
      },
    ])

    await expect(service.findPairingPool(BKK_QUERY)).resolves.toEqual([
      {
        id: 'f1',
        flightNumber: 'FD210',
        origin: 'BKK',
        destination: 'NRT',
        departureAt: '2026-09-15T05:30:00.000Z',
        arrivalAt: '2026-09-15T11:30:00.000Z',
        status: 'available',
      },
    ])
  })

  it('drops a flight that departs after dateTo in the base timezone', async () => {
    db.flight.findMany.mockResolvedValue([
      {
        id: 'late',
        flight_number: 'FD622',
        scheduled_dep_at: DEP_18SEP,
        scheduled_arr_at: DEP_18SEP,
        route: { origin: 'KUL', destination: 'BKK' },
      },
    ])

    // 01:00Z on the 18th is 08:00 in Bangkok, a day past the window.
    await expect(service.findPairingPool(BKK_QUERY)).resolves.toEqual([])
  })

  it('reaches two hops out so a return leg is never hidden from the builder', async () => {
    db.route.findMany
      .mockResolvedValueOnce([{ origin: 'BKK', destination: 'SIN' }])
      .mockResolvedValueOnce([{ origin: 'SIN', destination: 'KUL' }])

    await service.findPairingPool(BKK_QUERY)

    expect(db.route.findMany).toHaveBeenCalledTimes(2)
    expect(db.flight.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          route: expect.objectContaining({
            OR: [{ origin: { in: ['BKK', 'SIN', 'KUL'] } }, { destination: { in: ['BKK', 'SIN', 'KUL'] } }],
          }),
        }),
      }),
    )
  })
})
