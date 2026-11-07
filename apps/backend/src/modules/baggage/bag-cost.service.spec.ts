import { BagCostService } from './bag-cost.service'
import type { DbService } from '@backend/db/db.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const REPORT_ID = '77777777-7777-4777-8777-777777777777'
const EXPENSE_ID = '88888888-8888-4888-8888-888888888888'
const COST_ID = '99999999-9999-4999-8999-999999999999'
const SIM_NOW = new Date('2026-10-30T20:00:00Z')

function prismaError(code: string) {
  return Object.assign(new Error(code), { code })
}

/** Prisma returns NUMERIC as a Decimal; only its toString() is used. */
function decimal(value: string) {
  return { toString: () => value }
}

function costRow(id: string, amount: string, kind = 'forwarding') {
  return {
    id,
    report_id: REPORT_ID,
    expense_id: EXPENSE_ID,
    kind,
    created_at: SIM_NOW,
    expense: { amount: decimal(amount), description: 'x', incurred_on: new Date('2026-10-30T00:00:00Z'), created_by: STAFF_ID },
  }
}

function makeSvc() {
  const db = {
    lost_bag_report: {
      findUnique: jest.fn().mockResolvedValue({ id: REPORT_ID, case_number: 'LB-2026-000042', status: 'open' }),
    },
    expense: {
      create: jest.fn().mockResolvedValue({ id: EXPENSE_ID }),
      update: jest.fn().mockResolvedValue({}),
    },
    bag_cost: {
      create: jest.fn().mockResolvedValue(costRow(COST_ID, '1250.5')),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))

  return { svc: new BagCostService(db as unknown as DbService, { now: () => SIM_NOW }), db }
}

const input = { staffId: STAFF_ID, reportId: REPORT_ID, kind: 'forwarding' as const, amount: 1250.5 }

describe('BagCostService.add', () => {
  it("writes an 'other' expense on the simulated day and ties it to the case", async () => {
    const { svc, db } = makeSvc()

    const cost = await svc.add({ ...input, note: ' TG640 BKK-NRT ' })

    expect(db.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'other',
          amount: '1250.50',
          incurred_on: new Date('2026-10-30T00:00:00Z'),
          created_by: STAFF_ID,
          description: 'Forwarding cost for lost bag case LB-2026-000042: TG640 BKK-NRT',
        }),
      }),
    )
    expect(db.bag_cost.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { report_id: REPORT_ID, expense_id: EXPENSE_ID, kind: 'forwarding' } }),
    )
    expect(cost).toMatchObject({ id: COST_ID, amount: '1250.50', incurredOn: '2026-10-30', kind: 'forwarding' })
  })

  it('rejects a bad amount or kind before touching the database', async () => {
    const { svc, db } = makeSvc()

    for (const amount of [0, -5, 10.005, Number.NaN, 10_000_000_000]) {
      await expect(svc.add({ ...input, amount })).rejects.toMatchObject({ code: 'INVALID_COST', status: 400 })
    }
    await expect(svc.add({ ...input, kind: 'fuel' as never })).rejects.toMatchObject({ code: 'INVALID_COST' })
    expect(db.lost_bag_report.findUnique).not.toHaveBeenCalled()
  })

  it('needs an existing case that is not cancelled', async () => {
    const { svc, db } = makeSvc()

    db.lost_bag_report.findUnique.mockResolvedValueOnce(null)
    await expect(svc.add(input)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND', status: 404 })

    db.lost_bag_report.findUnique.mockResolvedValueOnce({ id: REPORT_ID, case_number: 'LB-2026-000042', status: 'cancelled' })
    await expect(svc.add(input)).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })

    expect(db.expense.create).not.toHaveBeenCalled()
  })

  it('maps an unknown staff member (P2003) to INVALID_COST', async () => {
    const { svc, db } = makeSvc()
    db.expense.create.mockRejectedValue(prismaError('P2003'))

    await expect(svc.add(input)).rejects.toMatchObject({ code: 'INVALID_COST' })
  })
})

describe('BagCostService.list and remove', () => {
  it('lists live costs with an exact total', async () => {
    const { svc, db } = makeSvc()
    db.bag_cost.findMany.mockResolvedValue([costRow(COST_ID, '0.1'), costRow(EXPENSE_ID, '0.2', 'storage')])

    const summary = await svc.list(REPORT_ID)

    expect(db.bag_cost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { report_id: REPORT_ID, expense: { deleted_at: null } } }),
    )
    expect(summary).toMatchObject({ reportId: REPORT_ID, caseNumber: 'LB-2026-000042', total: '0.30' })
    expect(summary.costs.map((c) => c.amount)).toEqual(['0.10', '0.20'])
  })

  it('soft-deletes the expense of a cost on this case', async () => {
    const { svc, db } = makeSvc()
    db.bag_cost.findFirst.mockResolvedValue({ expense_id: EXPENSE_ID })

    await svc.remove(REPORT_ID, COST_ID)

    expect(db.bag_cost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COST_ID, report_id: REPORT_ID, expense: { deleted_at: null } } }),
    )
    expect(db.expense.update).toHaveBeenCalledWith({
      where: { id: EXPENSE_ID },
      data: { deleted_at: expect.any(Date), updated_at: expect.any(Date) },
    })
  })

  it('404s a cost that is missing, removed or on another case', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.remove(REPORT_ID, COST_ID)).rejects.toMatchObject({ code: 'COST_NOT_FOUND', status: 404 })
    await expect(svc.remove(REPORT_ID, 'nope')).rejects.toMatchObject({ code: 'COST_NOT_FOUND' })
    expect(db.expense.update).not.toHaveBeenCalled()
  })
})
