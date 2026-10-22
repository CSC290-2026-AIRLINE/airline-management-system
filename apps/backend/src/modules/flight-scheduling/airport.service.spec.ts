import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AirportService } from './airport.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const valid = {
  iata_code: 'bkk',
  icao_code: 'vtbs',
  name: 'Suvarnabhumi',
  city: 'Bangkok',
  country: 'Thailand',
  timezone: 'Asia/Bangkok',
  min_turnaround_min: 45,
}
const prismaError = (code: string) => Object.assign(new Error(code), { code })

describe('AirportService', () => {
  const db = {
    airport: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    route: { count: jest.fn() },
  }
  const service = new AirportService(db as never)

  beforeEach(() => {
    jest.resetAllMocks()
    db.route.count.mockResolvedValue(0)
  })

  describe('create', () => {
    it('normalises codes and creates', async () => {
      db.airport.create.mockResolvedValue({})
      await service.create(valid)
      expect(db.airport.create).toHaveBeenCalledWith({
        data: { ...valid, iata_code: 'BKK', icao_code: 'VTBS', is_active: undefined },
      })
    })

    it.each([
      ['non-object body', 'nope'],
      ['bad iata', { ...valid, iata_code: 'BK' }],
      ['bad icao', { ...valid, icao_code: 'VTB' }],
      ['bad timezone', { ...valid, timezone: 'Mars/Base' }],
      ['non-integer turnaround', { ...valid, min_turnaround_min: 4.5 }],
      ['zero turnaround', { ...valid, min_turnaround_min: 0 }],
      ['blank name', { ...valid, name: '  ' }],
      ['non-boolean is_active', { ...valid, is_active: 'yes' }],
    ])('rejects %s', async (_label, body) => {
      await expect(service.create(body)).rejects.toBeInstanceOf(BadRequestException)
      expect(db.airport.create).not.toHaveBeenCalled()
    })

    it('maps a duplicate code to 409', async () => {
      db.airport.create.mockRejectedValue(prismaError('P2002'))
      await expect(service.create(valid)).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('update', () => {
    it('rejects a body iata_code that differs from the path', async () => {
      await expect(service.update('BKK', { ...valid, iata_code: 'DMK' })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('blocks deactivation while active routes use the airport', async () => {
      db.route.count.mockResolvedValue(2)
      await expect(service.update('BKK', { ...valid, is_active: false })).rejects.toBeInstanceOf(ConflictException)
      expect(db.airport.update).not.toHaveBeenCalled()
    })

    it('does not touch iata_code and works without it in the body', async () => {
      db.airport.update.mockResolvedValue({})
      await service.update('bkk', { ...valid, iata_code: undefined })
      expect(db.airport.update.mock.calls[0][0].where).toEqual({ iata_code: 'BKK' })
      expect(db.airport.update.mock.calls[0][0].data).not.toHaveProperty('iata_code')
    })

    it('maps P2025 to 404 and P2002 to 409', async () => {
      db.airport.update.mockRejectedValueOnce(prismaError('P2025'))
      await expect(service.update('BKK', valid)).rejects.toBeInstanceOf(NotFoundException)
      db.airport.update.mockRejectedValueOnce(prismaError('P2002'))
      await expect(service.update('BKK', valid)).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('get', () => {
    it('404s when missing', async () => {
      db.airport.findUnique.mockResolvedValue(null)
      await expect(service.get('bkk')).rejects.toBeInstanceOf(NotFoundException)
      expect(db.airport.findUnique).toHaveBeenCalledWith({ where: { iata_code: 'BKK' } })
    })
  })

  describe('list', () => {
    it.each([{ is_active: 'maybe' }, { cursor: 'nope' }, { limit: '0' }])('rejects %j', async (query) => {
      await expect(service.list(query)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('paginates and applies filters', async () => {
      db.airport.findMany.mockResolvedValue([{ iata_code: 'AAA' }, { iata_code: 'BBB' }, { iata_code: 'CCC' }])
      const result = await service.list({ limit: '2', country: 'Thailand', is_active: 'true', cursor: 'zzz', q: 'bang' })
      expect(result).toEqual({ data: [{ iata_code: 'AAA' }, { iata_code: 'BBB' }], nextCursor: 'BBB' })
      const args = db.airport.findMany.mock.calls[0][0]
      expect(args).toMatchObject({ take: 3, cursor: { iata_code: 'ZZZ' }, skip: 1 })
      expect(args.where).toMatchObject({ country: 'Thailand', is_active: true })
      expect(args.where.OR).toHaveLength(4)
    })
  })
})
