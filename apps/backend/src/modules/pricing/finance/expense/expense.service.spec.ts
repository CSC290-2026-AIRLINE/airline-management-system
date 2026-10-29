import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { ListExpensesDto } from './dto/list-expenses.dto'
import { ExpenseService } from './expense.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER_ID = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'
const EXPENSE_ID = '44444444-4444-4444-4444-444444444444'
const SCHEDULE_ID = '33333333-3333-3333-3333-333333333333'
const supplies = { category: 'other', description: 'Office supplies', amount: 3000, incurred_on: '2026-11-05' } as const
const manual = { id: EXPENSE_ID, ...supplies, payment_schedule_id: null }
const fromSchedule = { ...manual, category: 'maintenance', payment_schedule_id: SCHEDULE_ID }

// Same options as the global ValidationPipe in main.ts, so unknown fields such as payment_schedule_id are rejected too.
async function errorsFor<T extends object>(dto: new () => T, body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(dto, body), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((e) => e.property)
}

describe('CreateExpenseDto', () => {
  it('accepts a valid manual expense', async () => {
    expect(await errorsFor(CreateExpenseDto, supplies)).toEqual([])
  })

  it.each([
    ['category', 'fuel'],
    ['amount', 0],
    ['description', ''],
    ['description', undefined],
    ['incurred_on', undefined],
    ['incurred_on', '2026-11-05T10:00:00Z'],
  ])('rejects %s = %p', async (field, value) => {
    expect(await errorsFor(CreateExpenseDto, { ...supplies, [field]: value })).toEqual([field])
  })

  it.each(['payment_schedule_id', 'created_by'])('rejects %p in the body', async (field) => {
    expect(await errorsFor(CreateExpenseDto, { ...supplies, [field]: SCHEDULE_ID })).toEqual([field])
  })
})

describe('ListExpensesDto', () => {
  it.each(['2026-13', '2026-1', '11-2026', '2026-11-01'])('rejects the month %p', async (month) => {
    expect(await errorsFor(ListExpensesDto, { month })).toEqual(['month'])
  })
})

describe('ExpenseService', () => {
  let service: ExpenseService
  const db = {
    expense: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    staff: { findFirst: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    db.staff.findFirst.mockResolvedValue({ id: STAFF_ID })
    service = new ExpenseService(db as unknown as DbService)
  })

  describe('findAll', () => {
    it('lists live expenses only, oldest first', async () => {
      await service.findAll()

      expect(db.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null } }))
    })

    it('filters by month (1st up to the next 1st) and category', async () => {
      await service.findAll({ month: '2026-12', category: 'staff' })

      expect(db.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deleted_at: null, incurred_on: { gte: new Date('2026-12-01'), lt: new Date('2027-01-01') }, category: 'staff' },
        }),
      )
    })
  })

  it('throws EXPENSE_NOT_FOUND for a missing or deleted expense', async () => {
    db.expense.findFirst.mockResolvedValue(null)

    const error = await service.findOne(EXPENSE_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'EXPENSE_NOT_FOUND' })
  })

  describe('create', () => {
    it('stores incurred_on as a date and the staff id as created_by', async () => {
      await service.create(supplies, USER_ID)

      expect(db.expense.create).toHaveBeenCalledWith({ data: { ...supplies, incurred_on: new Date('2026-11-05'), created_by: STAFF_ID } })
    })

    it('refuses a user with no staff row', async () => {
      db.staff.findFirst.mockResolvedValue(null)

      await expect(service.create(supplies, USER_ID)).rejects.toBeInstanceOf(ForbiddenException)
      expect(db.expense.create).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('changes a manual expense and sets updated_at', async () => {
      db.expense.findFirst.mockResolvedValue(manual)

      await service.update(EXPENSE_ID, { amount: 3500 })

      expect(db.expense.update).toHaveBeenCalledWith({ where: { id: EXPENSE_ID }, data: { amount: 3500, updated_at: expect.any(Date) } })
    })

    it('refuses an expense created by paying a schedule with 409', async () => {
      db.expense.findFirst.mockResolvedValue(fromSchedule)

      const error = await service.update(EXPENSE_ID, { amount: 1 }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ConflictException)
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EXPENSE_FROM_SCHEDULE' })
      expect(db.expense.update).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('soft deletes a manual expense', async () => {
      db.expense.findFirst.mockResolvedValue(manual)

      await service.remove(EXPENSE_ID)

      expect(db.expense.update).toHaveBeenCalledWith({
        where: { id: EXPENSE_ID },
        data: { deleted_at: expect.any(Date), updated_at: expect.any(Date) },
      })
    })

    it('refuses an expense created by paying a schedule with 409', async () => {
      db.expense.findFirst.mockResolvedValue(fromSchedule)

      await expect(service.remove(EXPENSE_ID)).rejects.toBeInstanceOf(ConflictException)
      expect(db.expense.update).not.toHaveBeenCalled()
    })
  })
})
