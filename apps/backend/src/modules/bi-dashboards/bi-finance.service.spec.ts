import { toMonth } from './bi-finance.service'

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
