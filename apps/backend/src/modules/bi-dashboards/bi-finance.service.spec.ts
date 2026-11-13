import { BiFinanceService, toMonth } from './bi-finance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

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

describe('scheduled maintenance payments', () => {
  it('uses the simulation date and only reads live, scheduled maintenance payments in due-date order', async () => {
    const payments = [
      { id: 'payment-1', payee: 'HS-FYE', description: 'Engine shop visit', amount: 14800000, due_date: '2026-10-14', status: 'scheduled' },
    ]
    const query = jest.fn().mockResolvedValue(payments)
    const service = new BiFinanceService({ $queryRaw: query } as never)
    await expect(service.upcomingPayments('2026-10-05')).resolves.toEqual(payments)
    const [strings, today] = query.mock.calls[0] as [TemplateStringsArray, string]
    const sql = strings.join('?')
    expect(today).toBe('2026-10-05')
    expect(sql).toContain("category = 'maintenance' AND status = 'scheduled' AND deleted_at IS NULL")
    expect(sql).toContain('due_date >= ?::date')
    expect(sql).toContain('ORDER BY due_date, id')
  })
})
