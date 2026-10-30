import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FlightSchedulingService } from './flight-scheduling.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

describe('FlightSchedulingService.listFlights', () => {
  const findMany = jest.fn()
  const service = new FlightSchedulingService({ flight: { findMany } } as never)

  beforeEach(() => findMany.mockReset())

  it.each([
    { status: 'bogus' },
    { route_id: 'nope' },
    { cursor: 'nope' },
    { service_date: '2026-13-40' },
    { service_date: '2026-02-30' },
    { service_date: '22-10-2026' },
    { limit: '0' },
    { limit: '101' },
    { limit: 'abc' },
  ])('rejects %j', async (query) => {
    await expect(service.listFlights(query)).rejects.toBeInstanceOf(BadRequestException)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('returns nextCursor and trims the extra row when another page exists', async () => {
    findMany.mockResolvedValue([{ id: ID(1) }, { id: ID(2) }, { id: ID(3) }])
    const result = await service.listFlights({ limit: '2' })
    expect(result).toEqual({ data: [{ id: ID(1) }, { id: ID(2) }], nextCursor: ID(2) })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3, include: { aircraft: { select: { tail_number: true } } } }))
  })

  it('returns null nextCursor on the last page and passes filters and cursor to Prisma', async () => {
    findMany.mockResolvedValue([{ id: ID(3) }])
    const result = await service.listFlights({ status: 'delayed', service_date: '2026-10-22', cursor: ID(2) })
    expect(result.nextCursor).toBeNull()
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'delayed', route_id: undefined, service_date: new Date('2026-10-22T00:00:00Z') },
        cursor: { id: ID(2) },
        skip: 1,
        take: 21,
      }),
    )
  })
})

describe('FlightSchedulingService.getFlight', () => {
  const db = { flight: { findUnique: jest.fn() }, airport: { findMany: jest.fn() } }
  const service = new FlightSchedulingService(db as never)

  const route = { id: ID(5), origin: 'AAA', destination: 'BBB', distance_km: 900, block_time_min: 130 }
  const flight = (over: object = {}) => ({
    id: ID(1),
    flight_number: 'FL123',
    status: 'scheduled',
    scheduled_dep_at: new Date('2026-11-02T03:00:00Z'),
    dep_at: new Date('2026-11-02T03:00:00Z'),
    actual_destination: null,
    route,
    ...over,
  })

  beforeEach(() => {
    jest.resetAllMocks()
    db.airport.findMany.mockResolvedValue([
      { iata_code: 'AAA', name: 'A', city: 'a', country: 'x', timezone: 'Asia/Bangkok' },
      { iata_code: 'BBB', name: 'B', city: 'b', country: 'y', timezone: 'Asia/Tokyo' },
    ])
  })

  it('400s on a bad id and 404s on a missing flight', async () => {
    await expect(service.getFlight('nope')).rejects.toBeInstanceOf(BadRequestException)
    db.flight.findUnique.mockResolvedValue(null)
    await expect(service.getFlight(ID(1))).rejects.toBeInstanceOf(NotFoundException)
  })

  it('returns the flight with route and airports, no delay, planned destination', async () => {
    db.flight.findUnique.mockResolvedValue(flight())
    const result = await service.getFlight(ID(1))
    expect(result).toMatchObject({
      id: ID(1),
      delay_minutes: 0,
      effective_destination: 'BBB',
      route: {
        id: ID(5),
        distance_km: 900,
        block_time_min: 130,
        origin: { iata_code: 'AAA', timezone: 'Asia/Bangkok' },
        destination: { iata_code: 'BBB' },
      },
    })
    expect(result).not.toHaveProperty('route.origin.created_at')
    expect(db.flight.findUnique).toHaveBeenCalledWith({
      where: { id: ID(1) },
      include: { route: true, aircraft: { select: { tail_number: true } } },
    })
  })

  it('computes the total delay and uses the diversion airport', async () => {
    db.flight.findUnique.mockResolvedValue(
      flight({ dep_at: new Date('2026-11-02T04:25:00Z'), actual_destination: 'CCC', status: 'diverted' }),
    )
    const result = await service.getFlight(ID(1))
    expect(result.delay_minutes).toBe(85)
    expect(result.effective_destination).toBe('CCC')
  })
})

describe('FlightSchedulingService.listDisruptionReasons', () => {
  const findMany = jest.fn()
  const service = new FlightSchedulingService({ disruption_reason: { findMany } } as never)

  it('lists only active reasons in code order, without a next page', async () => {
    findMany.mockResolvedValue([{ code: 'ATC', category: 'air_traffic_control', description: 'Air traffic control' }])
    const result = await service.listDisruptionReasons()
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true }, orderBy: { code: 'asc' } }))
    expect(result).toEqual({
      data: [{ code: 'ATC', category: 'air_traffic_control', description: 'Air traffic control' }],
      nextCursor: null,
    })
  })
})
