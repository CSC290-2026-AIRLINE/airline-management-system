import { BiFinanceService, toMonth } from './bi-finance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/pricing/finance/summary/finance-summary.service', () => ({ FinanceSummaryService: class {} }))
jest.mock('@backend/modules/pricing/finance/payment-schedule/payment-schedule.service', () => ({ PaymentScheduleService: class {} }))

// Prisma returns Decimal columns as objects; a string-backed stand-in converts the same way through Number().
const decimal = (value: number) => ({ toString: () => value.toFixed(2), valueOf: () => value.toFixed(2) })

function summary(month: string, revenue: number, computedAt: string) {
  return {
    month: new Date(`${month}-01T00:00:00Z`),
    revenue_amount: decimal(revenue),
    pass_through_amount: decimal(100),
    refund_amount: decimal(50),
    maintenance_cost: decimal(80),
    staff_cost: decimal(120),
    catering_cost: decimal(30),
    other_cost: decimal(20),
    profit_amount: decimal(revenue - 400),
    computed_at: new Date(computedAt),
  }
}

function setup() {
  const summaries = { findRange: jest.fn().mockResolvedValue([]) }
  const schedules = { findAll: jest.fn().mockResolvedValue([]) }
  return { summaries, schedules, service: new BiFinanceService(summaries as never, schedules as never) }
}

describe('toMonth', () => {
  const row = {
    month: '2026-09',
    revenue: 1000,
    pass_through: 100,
    refund: 50,
    maintenance: 80,
    staff: 120,
    catering: 30,
    other: 20,
    profit: 600,
    computed_at: '2026-10-01T02:00:00Z',
  }

  it('derives costs and margin from the stored lines', () => {
    const month = toMonth(row)

    expect(month.costs).toBe(250)
    expect(month.margin_pct).toBeCloseTo(0.6)
  })

  it('keeps the stored profit, which the schema checks against its lines', () => {
    expect(toMonth(row).profit).toBe(600)
    expect(row.revenue - row.pass_through - row.refund - row.maintenance - row.staff - row.catering - row.other).toBe(600)
  })

  it('marks a month computed before it ended as partial', () => {
    expect(toMonth({ ...row, computed_at: '2026-09-15T10:00:00Z' }).partial).toBe(true)
    expect(toMonth(row).partial).toBe(false)
  })

  it('has no margin when there is no revenue', () => {
    expect(toMonth({ ...row, revenue: 0 }).margin_pct).toBeNull()
  })
})

describe('finance months through Feature 4', () => {
  it('reads every computed month once and returns the latest with the month before it', async () => {
    const { service, summaries } = setup()
    summaries.findRange.mockResolvedValue([
      summary('2026-08', 900, '2026-09-01T02:00:00.000Z'),
      summary('2026-09', 1000, '2026-10-01T02:00:00.000Z'),
    ])

    const result = await service.forMonth(undefined)

    expect(summaries.findRange).toHaveBeenCalledTimes(1)
    expect(result.months).toEqual(['2026-08', '2026-09'])
    expect(result.current).toEqual(
      expect.objectContaining({
        month: '2026-09',
        revenue: 1000,
        costs: 250,
        profit: 600,
        computed_at: '2026-10-01T02:00:00Z',
        partial: false,
      }),
    )
    expect(result.previous).toEqual(expect.objectContaining({ month: '2026-08', revenue: 900 }))
  })

  it('returns null for a month Feature 4 has not computed yet, and for a missing previous month', async () => {
    const { service, summaries } = setup()
    summaries.findRange.mockResolvedValue([summary('2026-09', 1000, '2026-09-15T10:00:00.000Z')])

    const chosen = await service.forMonth('2026-09')
    expect(chosen.current?.partial).toBe(true)
    expect(chosen.previous).toBeNull()
    expect((await service.forMonth('2026-11')).current).toBeNull()
  })

  it('returns no months when nothing has been computed', async () => {
    await expect(setup().service.forMonth(undefined)).resolves.toEqual({ current: null, previous: null, months: [] })
  })
})

describe('upcoming scheduled payments through Feature 4', () => {
  const payment = (id: string, category: string, dueDate: string) => ({
    id,
    category,
    payee: `Payee ${id}`,
    description: null,
    amount: decimal(1000),
    due_date: new Date(`${dueDate}T00:00:00Z`),
    status: 'scheduled',
  })

  it('lists scheduled payments of every category due from the simulation date, in due-date order', async () => {
    const { service, schedules } = setup()
    schedules.findAll.mockResolvedValue([
      payment('c', 'catering', '2026-10-20'),
      payment('old', 'maintenance', '2026-10-04'),
      payment('b', 'maintenance', '2026-10-05'),
      payment('a', 'staff', '2026-10-20'),
    ])

    const rows = await service.upcomingPayments('2026-10-05')

    expect(schedules.findAll).toHaveBeenCalledWith({ status: 'scheduled' })
    expect(rows.map((r) => [r.id, r.category, r.due_date])).toEqual([
      ['b', 'maintenance', '2026-10-05'],
      ['a', 'staff', '2026-10-20'],
      ['c', 'catering', '2026-10-20'],
    ])
    expect(rows[0]).toEqual(expect.objectContaining({ amount: 1000, status: 'scheduled', description: null }))
  })
})
