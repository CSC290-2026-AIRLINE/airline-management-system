import { ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common'
import { BiDashboardsController } from './bi-dashboards.controller'
import { BiFilterDto, BiFinanceQueryDto } from './dto/bi-filter.dto'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./bi-query.service', () => ({ BiQueryService: class {} }))
jest.mock('./bi-panels.service', () => ({ BiPanelsService: class {} }))

function setup() {
  const etl = { staffIdForUser: jest.fn(), refresh: jest.fn(), refreshWhenFree: jest.fn(), simulationNow: () => '2026-10-05T00:00:00Z' }
  const query = {
    dailyMetrics: jest.fn().mockResolvedValue([]),
    bookingsByRoute: jest.fn().mockResolvedValue([]),
    bookingDays: jest.fn().mockResolvedValue([]),
    flights: jest.fn().mockResolvedValue([]),
    cabins: jest.fn().mockResolvedValue([]),
    delayCauses: jest.fn().mockResolvedValue([]),
  }
  const finance = { forMonth: jest.fn(), upcomingPayments: jest.fn() }
  return { etl, query, finance, controller: new BiDashboardsController(etl as never, query as never, finance as never) }
}

describe('BI endpoint contracts', () => {
  it('rejects refresh for non-staff without starting an ETL run', async () => {
    const { controller, etl } = setup()
    etl.staffIdForUser.mockResolvedValue(null)
    await expect(controller.refresh({ id: 'user', email: 'customer@example.test' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(etl.refreshWhenFree).not.toHaveBeenCalled()
  })

  it('refreshes as the current staff member', async () => {
    const { controller, etl } = setup()
    etl.staffIdForUser.mockResolvedValue('staff')
    await controller.refresh({ id: 'user', email: 'staff@example.test' })
    expect(etl.refreshWhenFree).toHaveBeenCalledWith('manual', 'staff')
  })

  it('uses the simulation date for scheduled payments', async () => {
    const { controller, finance } = setup()
    await controller.upcomingPayments()
    expect(finance.upcomingPayments).toHaveBeenCalledWith('2026-10-05')
  })

  it('exports the booking-date rows with the selected route and dates', async () => {
    const { controller, query } = setup()
    const filter = { from: '2026-09-01', to: '2026-09-07', route_id: '11111111-1111-4111-8111-111111111111' }
    query.bookingsByRoute.mockResolvedValue([
      { booking_date: '2026-09-03', origin: 'BKK', destination: 'NRT', booking_count: 7, cancellation_count: 2 },
    ])
    const response = { setHeader: jest.fn() }
    expect(await controller.exportBookings(filter, response as never)).toBe(
      'booking_date,origin,destination,bookings,cancellations\r\n2026-09-03,BKK,NRT,7,2\r\n',
    )
    expect(query.bookingsByRoute).toHaveBeenCalledWith(filter)
    expect(query.flights).not.toHaveBeenCalled()
    expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="bookings.csv"')
  })

  it('exports metrics rows that match /bi/series for the same filters', async () => {
    const { controller, query } = setup()
    const day = (flight_date: string, departed: number, onTime: number) => ({
      flight_date,
      flight_count: departed,
      cancelled_count: 0,
      departed_count: departed,
      on_time_count: onTime,
      delay_minutes: 0,
      seat_available: 100 * departed,
      seat_sold: 80 * departed,
      revenue_amount: 10_000 * departed,
      refund_amount: 0,
    })
    query.dailyMetrics.mockResolvedValue([day('2026-10-05', 1, 1), day('2026-10-06', 3, 0)])
    query.bookingDays.mockResolvedValue([{ booking_date: '2026-10-06', booking_count: 9, cancellation_count: 2 }])
    const filter = { from: '2026-10-05', to: '2026-10-11', group: 'week' as const }
    const response = { setHeader: jest.fn() }

    const series = await controller.series(filter)
    const rows = (await controller.exportMetrics(filter, response as never)).trim().split('\r\n').slice(1)

    expect(series).toHaveLength(1)
    expect(rows).toEqual([`${series[0].period},4,0,4,25.0,80.0,100.00,9,2,7`])
    expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="metrics.csv"')
  })

  it('groups booking dates across month boundaries into ISO weeks', async () => {
    const { controller, query } = setup()
    query.bookingDays.mockResolvedValue([
      { booking_date: '2026-09-30', booking_count: 4, cancellation_count: 1 },
      { booking_date: '2026-10-01', booking_count: 3, cancellation_count: 2 },
    ])
    expect(await controller.bookingsSeries({ group: 'week' })).toEqual([{ period: '2026-09-28', bookings: 7, cancellations: 3 }])
  })

  it('returns 404 for an uncomputed finance export', async () => {
    const { controller, finance } = setup()
    finance.forMonth.mockResolvedValue({ current: null, previous: null, months: [] })
    await expect(controller.exportFinance({}, { setHeader: jest.fn() } as never)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('BI query validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  it.each([
    { from: '2026-02-30' },
    { from: '0000-01-01' },
    { from: '2026-09-01T12:00:00Z' },
    { from: '2026-10-01', to: '2026-09-01' },
    { to: 'bad-date' },
    { group: 'year' },
    { revenue_mode: 'gross' },
    { cabin: 'unknown' },
    { cause: 'unknown' },
    { route_id: 'bad-id' },
    { departed_only: 'yes' },
    { unknown: 'field' },
  ])('rejects invalid filters %j', async (value) => {
    await expect(pipe.transform(value, { type: 'query', metatype: BiFilterDto })).rejects.toThrow()
  })
  it.each(['2026-00', '2026-13', '2026-1', 'invalid', '0000-01'])('rejects invalid finance month %s', async (month) => {
    await expect(pipe.transform({ month }, { type: 'query', metatype: BiFinanceQueryDto })).rejects.toThrow()
  })
  it('accepts leap days and supported query values', async () => {
    const filters = { from: '2024-02-29', to: '2024-03-01', group: 'week', revenue_mode: 'after_refunds', departed_only: 'false' }
    await expect(pipe.transform(filters, { type: 'query', metatype: BiFilterDto })).resolves.toEqual(filters)
  })
})
