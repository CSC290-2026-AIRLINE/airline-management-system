import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { FinanceSummaryService, profitOf } from './finance-summary.service'
import { ParseMonthPipe } from './month.pipe'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

// What Prisma's groupBy returns: _sum.amount is a Decimal, which has toFixed.
const sum = (category: string, amount: number) => ({ category, _sum: { amount: { toFixed: (dp: number) => amount.toFixed(dp) } } })

describe('profitOf', () => {
  it('matches the worked example in the guide: 235,000', () => {
    expect(
      profitOf({
        revenue_amount: '1000000.00',
        pass_through_amount: '65000.00',
        refund_amount: '50000.00',
        maintenance_cost: '250000.00',
        staff_cost: '300000.00',
        catering_cost: '80000.00',
        other_cost: '20000.00',
      }),
    ).toBe('235000.00')
  })

  it('is exact to the cent where float subtraction is not (0.3 − 0.1 − 0.2)', () => {
    const zero = { pass_through_amount: '0.00', refund_amount: '0.00', staff_cost: '0.00', catering_cost: '0.00', other_cost: '0.00' }
    expect(profitOf({ ...zero, revenue_amount: '0.30', maintenance_cost: '0.10', other_cost: '0.20' })).toBe('0.00')
  })

  it('goes negative when costs are higher than revenue', () => {
    const zero = { revenue_amount: '0.00', pass_through_amount: '0.00', refund_amount: '0.00', staff_cost: '0.00', catering_cost: '0.00' }
    expect(profitOf({ ...zero, maintenance_cost: '93500.00', other_cost: '9800.50' })).toBe('-103300.50')
  })
})

describe('ParseMonthPipe', () => {
  const pipe = new ParseMonthPipe()

  it('passes a YYYY-MM month through', () => {
    expect(pipe.transform('2026-11')).toBe('2026-11')
  })

  it.each(['2026-13', '2026-00', '2026-1', '11-2026', '2026-11-01', 'nov'])('rejects %p with 400', (month) => {
    expect(() => pipe.transform(month)).toThrow(BadRequestException)
  })
})

describe('FinanceSummaryService', () => {
  let service: FinanceSummaryService
  const db = {
    expense: { groupBy: jest.fn() },
    finance_monthly_summary: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    db.expense.groupBy.mockResolvedValue([])
    service = new FinanceSummaryService(db as unknown as DbService)
  })

  describe('recompute', () => {
    it("sums the month's live expenses per category (cash basis: incurred_on in the month)", async () => {
      await service.recompute('2026-11')

      expect(db.expense.groupBy).toHaveBeenCalledWith({
        by: ['category'],
        where: { deleted_at: null, incurred_on: { gte: new Date('2026-11-01'), lt: new Date('2026-12-01') } },
        _sum: { amount: true },
      })
    })

    it('handles December, whose month ends in the next year', async () => {
      await service.recompute('2026-12')

      expect(db.expense.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ incurred_on: { gte: new Date('2026-12-01'), lt: new Date('2027-01-01') } }),
        }),
      )
    })

    it('saves the cost columns and profit for the first day of the month, with revenue at 0 until 5a / 5b', async () => {
      db.expense.groupBy.mockResolvedValue([sum('maintenance', 250000), sum('staff', 300000), sum('catering', 80000), sum('other', 20000)])

      await service.recompute('2026-11')

      const row = {
        revenue_amount: '0.00',
        pass_through_amount: '0.00',
        refund_amount: '0.00',
        maintenance_cost: '250000.00',
        staff_cost: '300000.00',
        catering_cost: '80000.00',
        other_cost: '20000.00',
        profit_amount: '-650000.00',
        computed_at: expect.any(Date),
      }
      expect(db.finance_monthly_summary.upsert).toHaveBeenCalledWith({
        where: { month: new Date('2026-11-01') },
        create: { month: new Date('2026-11-01'), ...row },
        update: row,
      })
    })

    it('leaves a category with no expenses at 0', async () => {
      db.expense.groupBy.mockResolvedValue([sum('catering', 14200)])

      await service.recompute('2026-10')

      const { create } = db.finance_monthly_summary.upsert.mock.calls[0][0] as { create: Record<string, unknown> }
      expect(create).toMatchObject({ maintenance_cost: '0.00', staff_cost: '0.00', catering_cost: '14200.00', other_cost: '0.00' })
      expect(create.profit_amount).toBe('-14200.00')
    })

    it('running it twice writes the same row to the same key, so there is still one row', async () => {
      db.expense.groupBy.mockResolvedValue([sum('other', 9800)])

      await service.recompute('2026-10')
      await service.recompute('2026-10')

      const [first, second] = db.finance_monthly_summary.upsert.mock.calls.map(([args]) => args as { where: unknown; update: object })
      expect(second.where).toEqual(first.where)
      expect({ ...second.update, computed_at: null }).toEqual({ ...first.update, computed_at: null })
    })
  })

  describe('find', () => {
    it('reads one month by its first day', async () => {
      db.finance_monthly_summary.findUnique.mockResolvedValue({ month: new Date('2026-11-01') })

      await service.find({ month: '2026-11' })

      expect(db.finance_monthly_summary.findUnique).toHaveBeenCalledWith({ where: { month: new Date('2026-11-01') } })
    })

    it('throws FINANCE_SUMMARY_NOT_FOUND for a month never recomputed', async () => {
      db.finance_monthly_summary.findUnique.mockResolvedValue(null)

      const error = await service.find({ month: '2026-11' }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(NotFoundException)
      expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'FINANCE_SUMMARY_NOT_FOUND' })
    })

    it('reads a range, both ends included, oldest first', async () => {
      await service.find({ from: '2026-06', to: '2026-10' })

      expect(db.finance_monthly_summary.findMany).toHaveBeenCalledWith({
        where: { month: { gte: new Date('2026-06-01'), lte: new Date('2026-10-01') } },
        orderBy: { month: 'asc' },
      })
    })

    it.each([{}, { from: '2026-06' }, { to: '2026-10' }, { month: '2026-11', from: '2026-06', to: '2026-10' }])(
      'refuses the query %p with 400',
      (query) => {
        expect(() => service.find(query)).toThrow(BadRequestException)
      },
    )

    it('refuses a range that ends before it starts', () => {
      expect(() => service.find({ from: '2026-10', to: '2026-06' })).toThrow(BadRequestException)
      expect(db.finance_monthly_summary.findMany).not.toHaveBeenCalled()
    })
  })
})
