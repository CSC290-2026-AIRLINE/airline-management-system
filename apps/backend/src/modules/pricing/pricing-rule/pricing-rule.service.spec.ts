import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { CreatePricingRuleDto } from './dto/create-pricing-rule.dto'
import { PricingRuleService } from './pricing-rule.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const RULE_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_ID = '22222222-2222-2222-2222-222222222222'
const CLASS_ID = '33333333-3333-3333-3333-333333333333'

const storedUrgency = {
  id: RULE_ID,
  rule_group: 'urgency',
  name: 'H-7',
  priority: 1,
  min_days_out: 0,
  max_days_out: 7,
  min_seats_left_pct: null,
  max_seats_left_pct: null,
  month: null,
  start_date: null,
  end_date: null,
  fare_class_id: null,
  adjustment_pct: '10.00',
  is_active: true,
  deleted_at: null,
}

// Every Nest HTTP exception has getResponse(); the tests check its type separately with toBeInstanceOf.
async function errorOf(promise: Promise<unknown>): Promise<BadRequestException> {
  try {
    await promise
  } catch (error) {
    return error as BadRequestException
  }
  throw new Error('Expected the call to be rejected')
}

describe('PricingRuleService', () => {
  let service: PricingRuleService
  const db = {
    pricing_rule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    fare_class: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  }

  beforeEach(() => {
    jest.resetAllMocks()
    service = new PricingRuleService(db as unknown as DbService)
  })

  describe('create', () => {
    const urgency: CreatePricingRuleDto = { rule_group: 'urgency', name: 'H-7', max_days_out: 7, adjustment_pct: 10 }

    it('adds the rule at the end of its group when no priority is given', async () => {
      db.pricing_rule.aggregate.mockResolvedValue({ _max: { priority: 3 } })
      db.pricing_rule.findFirst.mockResolvedValue(null)

      await service.create(urgency)

      expect(db.pricing_rule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ priority: 4 }) }))
    })

    it('stores period dates as UTC midnight', async () => {
      db.pricing_rule.aggregate.mockResolvedValue({ _max: { priority: null } })
      db.pricing_rule.findFirst.mockResolvedValue(null)

      await service.create({ rule_group: 'period', name: 'Songkran', start_date: '2026-04-10', end_date: '2026-04-16', adjustment_pct: 25 })

      expect(db.pricing_rule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 1,
            start_date: new Date('2026-04-10T00:00:00.000Z'),
            end_date: new Date('2026-04-16T00:00:00.000Z'),
          }),
        }),
      )
    })

    it("refuses another group's condition columns", async () => {
      const error = await errorOf(service.create({ ...urgency, month: 12 }))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.getResponse()).toMatchObject({ code: 'PRICING_RULE_INVALID', details: { fields: ['month'] } })
      expect(db.pricing_rule.create).not.toHaveBeenCalled()
    })

    it.each<[string, CreatePricingRuleDto]>([
      ['urgency with no days', { rule_group: 'urgency', name: 'x', adjustment_pct: 5 }],
      ['urgency with min > max', { rule_group: 'urgency', name: 'x', min_days_out: 8, max_days_out: 3, adjustment_pct: 5 }],
      ['load with no seat range', { rule_group: 'load', name: 'x', adjustment_pct: 5 }],
      ['load with min > max', { rule_group: 'load', name: 'x', min_seats_left_pct: 50, max_seats_left_pct: 10, adjustment_pct: 5 }],
      ['month with no month', { rule_group: 'month', name: 'x', adjustment_pct: 5 }],
      ['period missing end_date', { rule_group: 'period', name: 'x', start_date: '2026-04-10', adjustment_pct: 5 }],
      [
        'period ending before it starts',
        { rule_group: 'period', name: 'x', start_date: '2026-04-16', end_date: '2026-04-10', adjustment_pct: 5 },
      ],
    ])('refuses %s', async (_label, dto) => {
      await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException)
      expect(db.pricing_rule.create).not.toHaveBeenCalled()
    })

    it('refuses a fare class that does not exist', async () => {
      db.fare_class.findFirst.mockResolvedValue(null)

      const error = await errorOf(service.create({ ...urgency, fare_class_id: CLASS_ID }))

      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.getResponse()).toMatchObject({ code: 'FARE_CLASS_NOT_FOUND' })
    })

    it('refuses a priority already used in the group', async () => {
      db.pricing_rule.findFirst.mockResolvedValue({ id: OTHER_ID })

      const error = await errorOf(service.create({ ...urgency, priority: 1 }))

      expect(error).toBeInstanceOf(ConflictException)
      expect(error.getResponse()).toMatchObject({ code: 'PRICING_RULE_PRIORITY_TAKEN', details: { pricing_rule_id: OTHER_ID } })
    })

    it('maps a unique violation from the database to PRICING_RULE_PRIORITY_TAKEN', async () => {
      db.pricing_rule.findFirst.mockResolvedValue(null)
      db.pricing_rule.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

      await expect(service.create({ ...urgency, priority: 2 })).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('update', () => {
    it('throws PRICING_RULE_NOT_FOUND for a missing or deleted rule', async () => {
      db.pricing_rule.findFirst.mockResolvedValue(null)

      const error = await errorOf(service.update(RULE_ID, { name: 'x' }))

      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.getResponse()).toMatchObject({ code: 'PRICING_RULE_NOT_FOUND' })
    })

    it('checks the merged row, so a PATCH cannot clear the only condition', async () => {
      db.pricing_rule.findFirst.mockResolvedValue({ ...storedUrgency, min_days_out: null })

      await expect(service.update(RULE_ID, { max_days_out: null })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('checks min <= max against the stored value', async () => {
      db.pricing_rule.findFirst.mockResolvedValue(storedUrgency) // max_days_out 7

      await expect(service.update(RULE_ID, { min_days_out: 10 })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('updates and sets updated_at', async () => {
      db.pricing_rule.findFirst.mockResolvedValue(storedUrgency)

      await service.update(RULE_ID, { adjustment_pct: 12.5 })

      expect(db.pricing_rule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: RULE_ID },
          data: expect.objectContaining({ adjustment_pct: 12.5, updated_at: expect.any(Date) }),
        }),
      )
    })

    it('refuses a priority taken by another rule in the group', async () => {
      db.pricing_rule.findFirst.mockResolvedValueOnce(storedUrgency).mockResolvedValueOnce({ id: OTHER_ID })

      await expect(service.update(RULE_ID, { priority: 2 })).rejects.toBeInstanceOf(ConflictException)
      expect(db.pricing_rule.update).not.toHaveBeenCalled()
    })
  })

  it('soft deletes', async () => {
    db.pricing_rule.findFirst.mockResolvedValue(storedUrgency)

    await service.remove(RULE_ID)

    expect(db.pricing_rule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID },
      data: expect.objectContaining({ deleted_at: expect.any(Date) }),
    })
  })

  describe('reorder', () => {
    it('shifts the whole group first, then writes 1, 2, 3 in one transaction', async () => {
      db.pricing_rule.findMany.mockResolvedValueOnce([{ id: RULE_ID }, { id: OTHER_ID }]).mockResolvedValueOnce([])

      await service.reorder({ rule_group: 'urgency', ids: [OTHER_ID, RULE_ID] })

      expect(db.pricing_rule.updateMany).toHaveBeenCalledWith({
        where: { rule_group: 'urgency', deleted_at: null },
        data: { priority: { increment: 1000 } },
      })
      expect(db.pricing_rule.update).toHaveBeenNthCalledWith(1, { where: { id: OTHER_ID }, data: expect.objectContaining({ priority: 1 }) })
      expect(db.pricing_rule.update).toHaveBeenNthCalledWith(2, { where: { id: RULE_ID }, data: expect.objectContaining({ priority: 2 }) })
      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(db.$transaction.mock.calls[0][0]).toHaveLength(3)
    })

    it('refuses a list that leaves out a live rule or names an unknown one', async () => {
      db.pricing_rule.findMany.mockResolvedValue([{ id: RULE_ID }, { id: OTHER_ID }])

      const error = await errorOf(service.reorder({ rule_group: 'urgency', ids: [RULE_ID, CLASS_ID] }))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.getResponse()).toMatchObject({
        code: 'PRICING_RULE_REORDER_MISMATCH',
        details: { missing: [OTHER_ID], unknown: [CLASS_ID] },
      })
      expect(db.$transaction).not.toHaveBeenCalled()
    })
  })

  it('lists rules in engine order: urgency, load, month, period', async () => {
    db.pricing_rule.findMany.mockResolvedValue([
      { id: 'p', rule_group: 'period' },
      { id: 'u', rule_group: 'urgency' },
      { id: 'm', rule_group: 'month' },
      { id: 'l', rule_group: 'load' },
    ])

    const rules = await service.findAll()

    expect(rules.map((r) => r.id)).toEqual(['u', 'l', 'm', 'p'])
  })

  it('applyRules loads only live, active rules for this fare class or for all classes', async () => {
    db.pricing_rule.findMany.mockResolvedValue([storedUrgency])

    const result = await service.applyRules(1000, {
      fareClassId: CLASS_ID,
      daysToDeparture: 5,
      seatsLeftPct: 50,
      departureDate: '2026-11-01',
    })

    expect(db.pricing_rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deleted_at: null, is_active: true, OR: [{ fare_class_id: null }, { fare_class_id: CLASS_ID }] },
      }),
    )
    expect(result.amount).toBe(1100)
  })
})
