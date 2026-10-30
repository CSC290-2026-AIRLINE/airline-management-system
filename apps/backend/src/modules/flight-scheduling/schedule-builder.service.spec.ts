import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ScheduleBuilderService } from './schedule-builder.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const TT = '00000000-0000-0000-0000-000000000009'
const day = (s: string) => new Date(`${s}T00:00:00Z`)
const timetable = (over: object = {}) => ({
  id: TT,
  route_id: 'r1',
  flight_number: 'FL123',
  dep_time_local: new Date('1970-01-01T10:00:00Z'),
  days_of_week: [1, 3, 5], // Monday, Wednesday, Friday
  valid_from: day('2026-11-01'),
  valid_to: day('2027-03-31'),
  ...over,
})
const route = { id: 'r1', origin: 'AAA', destination: 'BBB', block_time_min: 130, is_active: true }
const airports = (over: object = {}) => [
  { iata_code: 'AAA', timezone: 'Asia/Bangkok', is_active: true, ...over },
  { iata_code: 'BBB', timezone: 'Asia/Tokyo', is_active: true },
]

describe('ScheduleBuilderService.preview', () => {
  const db = {
    flight_pattern: { findUnique: jest.fn() },
    route: { findUnique: jest.fn() },
    airport: { findMany: jest.fn() },
    flight: { findMany: jest.fn() },
  }
  const service = new ScheduleBuilderService(db as never)

  beforeEach(() => {
    jest.resetAllMocks()
    db.flight_pattern.findUnique.mockResolvedValue(timetable())
    db.route.findUnique.mockResolvedValue(route)
    db.airport.findMany.mockResolvedValue(airports())
    db.flight.findMany.mockResolvedValue([])
  })

  it.each([
    ['non-object body', null],
    ['bad timetable id', { timetable_id: 'x' }],
    ['impossible date', { timetable_id: TT, from: '2026-02-30' }],
    ['to before from', { timetable_id: TT, from: '2026-12-02', to: '2026-12-01' }],
    ['period over 366 days', { timetable_id: TT, from: '2026-01-01', to: '2027-12-31' }],
  ])('rejects %s', async (_label, body) => {
    await expect(service.preview(body)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('404s when the timetable is missing', async () => {
    db.flight_pattern.findUnique.mockResolvedValue(null)
    await expect(service.preview({ timetable_id: TT })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses an inactive route or airport', async () => {
    db.route.findUnique.mockResolvedValue({ ...route, is_active: false })
    await expect(service.preview({ timetable_id: TT })).rejects.toBeInstanceOf(BadRequestException)
    db.route.findUnique.mockResolvedValue(route)
    db.airport.findMany.mockResolvedValue(airports({ is_active: false }))
    await expect(service.preview({ timetable_id: TT })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('generates only the operating weekdays, in UTC, with arrival from block time', async () => {
    const result = await service.preview({ timetable_id: TT, from: '2026-11-02', to: '2026-11-08' }) // Monday to Sunday
    expect(result.flights.map((f) => f.service_date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06'])
    expect(result.flights[0]).toMatchObject({
      flight_number: 'FL123',
      scheduled_dep_at: '2026-11-02T03:00:00.000Z', // 10:00 in Bangkok
      scheduled_arr_at: '2026-11-02T05:10:00.000Z', // plus 130 minutes
      departure_local: '2026-11-02T10:00',
      arrival_local: '2026-11-02T14:10', // Tokyo is 2 hours ahead
      overnight: false,
      already_exists: false,
      warnings: [],
    })
    expect(result.summary).toEqual({ total: 3, new: 3, already_exists: 0 })
    expect(result.warnings).toEqual([])
  })

  it('defaults to the timetable validity and clamps a wider request to it', async () => {
    const result = await service.preview({ timetable_id: TT, from: '2026-10-25', to: '2026-11-04' })
    expect(result.period).toEqual({ from: '2026-11-01', to: '2026-11-04' })
    expect(result.flights.map((f) => f.service_date)).toEqual(['2026-11-02', '2026-11-04'])
    expect((await service.preview({ timetable_id: TT })).period).toEqual({ from: '2026-11-01', to: '2027-03-31' })
  })

  it('flags an overnight flight that lands on a later calendar day', async () => {
    db.flight_pattern.findUnique.mockResolvedValue(timetable({ dep_time_local: new Date('1970-01-01T23:55:00Z') }))
    db.route.findUnique.mockResolvedValue({ ...route, block_time_min: 480 })
    const [flight] = (await service.preview({ timetable_id: TT, from: '2026-11-02', to: '2026-11-02' })).flights
    expect(flight).toMatchObject({ departure_local: '2026-11-02T23:55', arrival_local: '2026-11-03T09:55', overnight: true })
  })

  it('warns when a clock change moves the departure', async () => {
    db.airport.findMany.mockResolvedValue([
      { iata_code: 'AAA', timezone: 'America/New_York', is_active: true },
      { iata_code: 'BBB', timezone: 'Europe/London', is_active: true },
    ])
    db.flight_pattern.findUnique.mockResolvedValue(
      timetable({
        dep_time_local: new Date('1970-01-01T02:30:00Z'),
        days_of_week: [7],
        valid_from: day('2026-03-01'),
        valid_to: day('2026-03-31'),
      }),
    )
    const result = await service.preview({ timetable_id: TT })
    const gapDay = result.flights.find((f) => f.service_date === '2026-03-08')
    expect(gapDay?.scheduled_dep_at).toBe('2026-03-08T07:30:00.000Z')
    expect(gapDay?.warnings[0]).toMatch(/does not exist/)
    expect(result.flights.filter((f) => f.warnings.length)).toHaveLength(1)
  })

  it('marks dates that already have a flight', async () => {
    db.flight.findMany.mockResolvedValue([{ service_date: day('2026-11-04') }])
    const result = await service.preview({ timetable_id: TT, from: '2026-11-02', to: '2026-11-08' })
    expect(result.flights.map((f) => f.already_exists)).toEqual([false, true, false])
    expect(result.flights[1].warnings).toHaveLength(1)
    expect(result.summary).toEqual({ total: 3, new: 2, already_exists: 1 })
  })

  it('reports an empty period instead of failing', async () => {
    const outside = await service.preview({ timetable_id: TT, from: '2028-01-01', to: '2028-01-31' })
    expect(outside.flights).toEqual([])
    expect(outside.warnings).toHaveLength(1)
    expect(db.flight.findMany).not.toHaveBeenCalled()
    const noOperatingDay = await service.preview({ timetable_id: TT, from: '2026-11-03', to: '2026-11-03' }) // a Tuesday
    expect(noOperatingDay.summary.total).toBe(0)
  })
})
