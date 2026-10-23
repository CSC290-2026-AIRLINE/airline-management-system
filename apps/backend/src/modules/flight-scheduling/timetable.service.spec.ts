import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { TimetableService } from './timetable.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ROUTE = '00000000-0000-0000-0000-000000000001'
const OTHER_ROUTE = '00000000-0000-0000-0000-000000000002'
const ID = '00000000-0000-0000-0000-000000000009'
const valid = {
  route_id: ROUTE,
  flight_number: 'fl123',
  dep_time_local: '10:00',
  days_of_week: [5, 1, 3, 1],
  valid_from: '2026-11-01',
  valid_to: '2027-03-31',
}
const row = {
  id: ID,
  route_id: ROUTE,
  flight_number: 'FL123',
  dep_time_local: new Date('1970-01-01T10:00:00Z'),
  days_of_week: [1, 3, 5],
  valid_from: new Date('2026-11-01T00:00:00Z'),
  valid_to: new Date('2027-03-31T00:00:00Z'),
}
const prismaError = (code: string) => Object.assign(new Error(code), { code })

describe('TimetableService', () => {
  const db = {
    flight_pattern: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    flight_setting: { findUnique: jest.fn() },
    route: { findUnique: jest.fn() },
    flight: { count: jest.fn() },
  }
  const service = new TimetableService(db as never)

  beforeEach(() => {
    jest.resetAllMocks()
    db.flight_setting.findUnique.mockResolvedValue(null)
    db.route.findUnique.mockResolvedValue({ id: ROUTE, is_active: true })
    db.flight.count.mockResolvedValue(0)
  })

  describe('create', () => {
    it('normalises the body, dedupes and sorts days, and returns HH:MM and YYYY-MM-DD', async () => {
      db.flight_pattern.create.mockResolvedValue(row)
      const result = await service.create(valid)
      expect(db.flight_pattern.create).toHaveBeenCalledWith({
        data: {
          route_id: ROUTE,
          flight_number: 'FL123',
          dep_time_local: new Date('1970-01-01T10:00:00Z'),
          days_of_week: [1, 3, 5],
          valid_from: new Date('2026-11-01T00:00:00Z'),
          valid_to: new Date('2027-03-31T00:00:00Z'),
        },
      })
      expect(result).toMatchObject({ dep_time_local: '10:00', valid_from: '2026-11-01', valid_to: '2027-03-31' })
    })

    it.each([
      ['non-object body', 'nope'],
      ['bad route id', { ...valid, route_id: 'x' }],
      ['blank flight number', { ...valid, flight_number: ' ' }],
      ['bad time', { ...valid, dep_time_local: '25:00' }],
      ['time without leading zero', { ...valid, dep_time_local: '9:30' }],
      ['empty days', { ...valid, days_of_week: [] }],
      ['day 0', { ...valid, days_of_week: [0, 1] }],
      ['day 8', { ...valid, days_of_week: [8] }],
      ['non-integer day', { ...valid, days_of_week: [1.5] }],
      ['missing valid_from', { ...valid, valid_from: undefined }],
      ['impossible date', { ...valid, valid_to: '2027-02-30' }],
      ['valid_to before valid_from', { ...valid, valid_from: '2027-04-01' }],
    ])('rejects %s', async (_label, body) => {
      await expect(service.create(body)).rejects.toBeInstanceOf(BadRequestException)
      expect(db.flight_pattern.create).not.toHaveBeenCalled()
    })

    it('allows a one-day validity period', async () => {
      db.flight_pattern.create.mockResolvedValue(row)
      await service.create({ ...valid, valid_from: '2026-11-01', valid_to: '2026-11-01' })
      expect(db.flight_pattern.create).toHaveBeenCalled()
    })

    it('uses the airline code setting when it exists, else a 2-character fallback', async () => {
      db.flight_setting.findUnique.mockResolvedValue({ key: 'airline_code', value: 'FL' })
      await expect(service.create({ ...valid, flight_number: 'XX123' })).rejects.toBeInstanceOf(BadRequestException)
      await expect(service.create({ ...valid, flight_number: 'FL12345' })).rejects.toBeInstanceOf(BadRequestException)
      await expect(service.create({ ...valid, flight_number: 'FL' })).rejects.toBeInstanceOf(BadRequestException)
      db.flight_setting.findUnique.mockResolvedValue(null)
      await expect(service.create({ ...valid, flight_number: 'FLIGHT1' })).rejects.toBeInstanceOf(BadRequestException)
      expect(db.flight_pattern.create).not.toHaveBeenCalled()
    })

    it('rejects a missing or inactive route', async () => {
      db.route.findUnique.mockResolvedValueOnce(null)
      await expect(service.create(valid)).rejects.toBeInstanceOf(BadRequestException)
      db.route.findUnique.mockResolvedValueOnce({ id: ROUTE, is_active: false })
      await expect(service.create(valid)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('maps a duplicate flight number to 409', async () => {
      db.flight_pattern.create.mockRejectedValue(prismaError('P2002'))
      await expect(service.create(valid)).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('update', () => {
    it('404s when missing and 400s on a bad id', async () => {
      db.flight_pattern.findUnique.mockResolvedValue(null)
      await expect(service.update(ID, valid)).rejects.toBeInstanceOf(NotFoundException)
      await expect(service.update('nope', valid)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('allows changing times and days even after flights were generated', async () => {
      db.flight_pattern.findUnique.mockResolvedValue(row)
      db.flight_pattern.update.mockResolvedValue(row)
      db.flight.count.mockResolvedValue(10)
      await service.update(ID, { ...valid, dep_time_local: '11:30', days_of_week: [2] })
      expect(db.flight.count).not.toHaveBeenCalled()
      expect(db.flight_pattern.update).toHaveBeenCalled()
    })

    it('blocks changing route or flight number once flights were generated', async () => {
      db.flight_pattern.findUnique.mockResolvedValue(row)
      db.route.findUnique.mockResolvedValue({ id: OTHER_ROUTE, is_active: true })
      db.flight.count.mockResolvedValue(3)
      await expect(service.update(ID, { ...valid, route_id: OTHER_ROUTE })).rejects.toBeInstanceOf(ConflictException)
      await expect(service.update(ID, { ...valid, flight_number: 'FL999' })).rejects.toBeInstanceOf(ConflictException)
      expect(db.flight_pattern.update).not.toHaveBeenCalled()
    })

    it('allows changing route or flight number when no flights were generated', async () => {
      db.flight_pattern.findUnique.mockResolvedValue(row)
      db.flight_pattern.update.mockResolvedValue(row)
      await service.update(ID, { ...valid, flight_number: 'FL999' })
      expect(db.flight_pattern.update).toHaveBeenCalledTimes(1)
    })
  })

  describe('list and get', () => {
    it('paginates, uppercases the flight number filter and applies valid_on', async () => {
      db.flight_pattern.findMany.mockResolvedValue([row, { ...row, id: 'b' }, { ...row, id: 'c' }])
      const result = await service.list({ limit: '2', flight_number: 'fl123', valid_on: '2026-12-01', route_id: ROUTE, cursor: ID })
      expect(result.data).toHaveLength(2)
      expect(result.nextCursor).toBe('b')
      expect(db.flight_pattern.findMany.mock.calls[0][0]).toMatchObject({
        where: {
          route_id: ROUTE,
          flight_number: 'FL123',
          valid_from: { lte: new Date('2026-12-01T00:00:00Z') },
          valid_to: { gte: new Date('2026-12-01T00:00:00Z') },
        },
        take: 3,
        cursor: { id: ID },
        skip: 1,
      })
    })

    it('counts the flights generated from each timetable', async () => {
      db.flight_pattern.findMany.mockResolvedValue([{ ...row, _count: { flight: 4 } }])
      const result = await service.list({})
      expect(db.flight_pattern.findMany.mock.calls[0][0]).toMatchObject({ include: { _count: { select: { flight: true } } } })
      expect(result.data[0]).toMatchObject({ generated_flights: 4 })
      expect(result.data[0]).not.toHaveProperty('_count')
    })

    it.each([{ route_id: 'x' }, { cursor: 'x' }, { valid_on: '2026-02-30' }, { limit: '0' }])('rejects %j', async (query) => {
      await expect(service.list(query)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('404s on a missing timetable', async () => {
      db.flight_pattern.findUnique.mockResolvedValue(null)
      await expect(service.get(ID)).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
