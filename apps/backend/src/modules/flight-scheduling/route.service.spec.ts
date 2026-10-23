import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { RouteService } from './route.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ID = '00000000-0000-0000-0000-000000000001'
const valid = { origin: 'aaa', destination: 'bbb', distance_km: 900, block_time_min: 130 }
const airports = (activeB = true) => [
  { iata_code: 'AAA', is_active: true },
  { iata_code: 'BBB', is_active: activeB },
]
const prismaError = (code: string) => Object.assign(new Error(code), { code })

describe('RouteService', () => {
  const db = {
    route: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    airport: { findMany: jest.fn() },
    flight: { count: jest.fn() },
    flight_pattern: { count: jest.fn() },
  }
  const service = new RouteService(db as never)

  beforeEach(() => {
    jest.resetAllMocks()
    db.airport.findMany.mockResolvedValue(airports())
    db.flight.count.mockResolvedValue(0)
    db.flight_pattern.count.mockResolvedValue(0)
  })

  describe('create', () => {
    it('normalises codes and creates', async () => {
      db.route.create.mockResolvedValue({})
      await service.create(valid)
      expect(db.route.create).toHaveBeenCalledWith({ data: { ...valid, origin: 'AAA', destination: 'BBB', is_active: undefined } })
    })

    it.each([
      ['non-object body', null],
      ['bad origin', { ...valid, origin: 'AA' }],
      ['same origin and destination', { ...valid, destination: 'AAA' }],
      ['zero distance', { ...valid, distance_km: 0 }],
      ['float block time', { ...valid, block_time_min: 1.5 }],
      ['string distance', { ...valid, distance_km: '900' }],
      ['non-boolean is_active', { ...valid, is_active: 1 }],
    ])('rejects %s', async (_label, body) => {
      await expect(service.create(body)).rejects.toBeInstanceOf(BadRequestException)
      expect(db.route.create).not.toHaveBeenCalled()
    })

    it('rejects a missing airport and an inactive airport', async () => {
      db.airport.findMany.mockResolvedValueOnce([{ iata_code: 'AAA', is_active: true }])
      await expect(service.create(valid)).rejects.toMatchObject({ response: { message: ['airport BBB does not exist'] } })
      db.airport.findMany.mockResolvedValueOnce(airports(false))
      await expect(service.create(valid)).rejects.toMatchObject({ response: { message: ['airport BBB is inactive'] } })
      expect(db.route.create).not.toHaveBeenCalled()
    })

    it('maps a duplicate pair to 409', async () => {
      db.route.create.mockRejectedValue(prismaError('P2002'))
      await expect(service.create(valid)).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('update', () => {
    const current = { id: ID, origin: 'AAA', destination: 'BBB', is_active: true }

    it('404s when the route is missing and 400s on a bad id', async () => {
      db.route.findUnique.mockResolvedValue(null)
      await expect(service.update(ID, valid)).rejects.toBeInstanceOf(NotFoundException)
      await expect(service.update('nope', valid)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('blocks changing airports once flights or timetables exist', async () => {
      db.route.findUnique.mockResolvedValue(current)
      db.airport.findMany.mockResolvedValue([
        { iata_code: 'AAA', is_active: true },
        { iata_code: 'CCC', is_active: true },
      ])
      db.flight_pattern.count.mockResolvedValue(1)
      await expect(service.update(ID, { ...valid, destination: 'ccc' })).rejects.toBeInstanceOf(ConflictException)
      expect(db.route.update).not.toHaveBeenCalled()
    })

    it('allows changing distance without touching the airport checks', async () => {
      db.route.findUnique.mockResolvedValue(current)
      db.route.update.mockResolvedValue({})
      await service.update(ID, { ...valid, distance_km: 1000 })
      expect(db.airport.findMany).not.toHaveBeenCalled()
      expect(db.route.update).toHaveBeenCalled()
    })

    it('blocks deactivation while live flights exist, allows it otherwise', async () => {
      db.route.findUnique.mockResolvedValue(current)
      db.flight.count.mockResolvedValueOnce(3)
      await expect(service.update(ID, { ...valid, is_active: false })).rejects.toBeInstanceOf(ConflictException)
      db.flight.count.mockResolvedValueOnce(0)
      db.route.update.mockResolvedValue({})
      await service.update(ID, { ...valid, is_active: false })
      expect(db.route.update).toHaveBeenCalledTimes(1)
    })
  })

  describe('list and get', () => {
    it('paginates with filters', async () => {
      db.route.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
      const result = await service.list({ limit: '2', origin: 'aaa', is_active: 'true', cursor: ID })
      expect(result).toEqual({ data: [{ id: 'a' }, { id: 'b' }], nextCursor: 'b' })
      expect(db.route.findMany.mock.calls[0][0]).toMatchObject({
        where: { origin: 'AAA', destination: undefined, is_active: true },
        take: 3,
        cursor: { id: ID },
        skip: 1,
      })
    })

    it('counts the timetables that use each route', async () => {
      db.route.findMany.mockResolvedValue([{ id: 'a', _count: { flight_pattern: 2 } }])
      const result = await service.list({})
      expect(db.route.findMany.mock.calls[0][0]).toMatchObject({ include: { _count: { select: { flight_pattern: true } } } })
      expect(result.data[0]).toEqual({ id: 'a', pattern_count: 2 })
    })

    it.each([{ is_active: 'x' }, { origin: 'A' }, { cursor: 'nope' }, { limit: '101' }])('rejects %j', async (query) => {
      await expect(service.list(query)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('404s on a missing route', async () => {
      db.route.findUnique.mockResolvedValue(null)
      await expect(service.get(ID)).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
