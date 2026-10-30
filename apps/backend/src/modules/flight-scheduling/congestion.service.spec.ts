import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { CongestionService } from './congestion.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ID = '00000000-0000-0000-0000-000000000001'
const valid = { airport: 'cnx', date: '2026-10-02', from: '08:30', to: '10:00', max_movement_per_hour: 1, disruption_reason_code: 'APT' }
const prismaError = (code: string) => Object.assign(new Error(code), { code })

describe('CongestionService', () => {
  const db = {
    airport_congestion: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    airport: { findUnique: jest.fn() },
    disruption_reason: { findUnique: jest.fn() },
    flight: { findMany: jest.fn() },
  }
  const service = new CongestionService(db as never)

  beforeEach(() => {
    jest.resetAllMocks()
    db.airport.findUnique.mockResolvedValue({ timezone: 'Asia/Bangkok' })
    db.disruption_reason.findUnique.mockResolvedValue({ code: 'APT' })
    db.airport_congestion.findFirst.mockResolvedValue(null)
  })

  it('stores a local window at the airport as UTC', async () => {
    db.airport_congestion.create.mockResolvedValue({ id: ID })
    await service.create(valid)
    expect(db.airport_congestion.create).toHaveBeenCalledWith({
      data: {
        airport: 'CNX',
        starts_at: new Date('2026-10-02T01:30:00Z'),
        ends_at: new Date('2026-10-02T03:00:00Z'),
        max_movement_per_hour: 1,
        disruption_reason_code: 'APT',
      },
    })
  })

  it.each([
    { airport: 'cn' },
    { date: '2026-02-30' },
    { from: '8:30' },
    { to: '08:30' },
    { max_movement_per_hour: 0 },
    { disruption_reason_code: '' },
  ])('rejects %j', async (patch) => {
    await expect(service.create({ ...valid, ...patch })).rejects.toBeInstanceOf(BadRequestException)
    expect(db.airport_congestion.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown airport or reason and an overlapping window', async () => {
    db.airport.findUnique.mockResolvedValue(null)
    await expect(service.create(valid)).rejects.toBeInstanceOf(BadRequestException)
    db.airport.findUnique.mockResolvedValue({ timezone: 'Asia/Bangkok' })
    db.disruption_reason.findUnique.mockResolvedValue(null)
    await expect(service.create(valid)).rejects.toBeInstanceOf(BadRequestException)
    db.disruption_reason.findUnique.mockResolvedValue({ code: 'APT' })
    db.airport_congestion.findFirst.mockResolvedValue({ id: ID })
    await expect(service.create(valid)).rejects.toBeInstanceOf(ConflictException)
  })

  it('counts movements per hour from the window start and lists the flights in over-limit hours', async () => {
    const start = new Date('2026-10-02T01:30:00Z')
    db.airport_congestion.findMany.mockResolvedValue([
      { id: ID, airport: 'CNX', starts_at: start, ends_at: new Date('2026-10-02T03:00:00Z'), max_movement_per_hour: 1 },
    ])
    const flight = (id: string, origin: string, dep: string, arr: string) => ({
      id,
      flight_number: id,
      service_date: new Date('2026-10-02T00:00:00Z'),
      dep_at: new Date(dep),
      arr_at: new Date(arr),
      route: { origin },
    })
    db.flight.findMany.mockResolvedValue([
      flight('XX101', 'BKK', '2026-10-02T00:00:00Z', '2026-10-02T02:00:00Z'), // arrives CNX 02:00, hour 0
      flight('XX102', 'CNX', '2026-10-02T02:30:00Z', '2026-10-02T03:45:00Z'), // departs CNX 02:30, hour 1
      flight('XX103', 'CNX', '2026-10-02T02:10:00Z', '2026-10-02T03:25:00Z'), // departs CNX 02:10, hour 0
    ])
    const { data } = await service.list({})
    expect(data[0].peak_movements).toBe(2)
    expect(data[0].over_limit.map((m) => `${m.flight_number} ${m.kind}`)).toEqual(['XX101 arrives', 'XX103 departs'])
  })

  it('404s a missing window and 400s a bad id', async () => {
    db.airport_congestion.delete.mockRejectedValue(prismaError('P2025'))
    await expect(service.remove(ID)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.remove('nope')).rejects.toBeInstanceOf(BadRequestException)
  })
})
