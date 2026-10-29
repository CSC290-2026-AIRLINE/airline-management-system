import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import { CreatePaymentScheduleDto } from './dto/create-payment-schedule.dto'
import { PaymentScheduleService } from './payment-schedule.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER_ID = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'
const SCHEDULE_ID = '33333333-3333-3333-3333-333333333333'
const bill = { category: 'maintenance', payee: 'Thai Aero Maintenance', amount: 250000, due_date: '2026-11-30' } as const
const scheduled = { id: SCHEDULE_ID, ...bill, status: 'scheduled', paid_on: null }
const paid = { ...scheduled, status: 'paid', paid_on: new Date('2026-11-29') }

// Same options as the global ValidationPipe in main.ts, so unknown fields such as status are rejected too.
async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreatePaymentScheduleDto, body), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((e) => e.property)
}

describe('CreatePaymentScheduleDto', () => {
  it('accepts a valid bill, with or without a description', async () => {
    expect(await errorsFor(bill)).toEqual([])
    expect(await errorsFor({ ...bill, description: 'Engine check' })).toEqual([])
  })

  it.each(['fuel', 'Maintenance', ''])('rejects the category %p', async (category) => {
    expect(await errorsFor({ ...bill, category })).toEqual(['category'])
  })

  it.each([0, -1, '250000'])('rejects the amount %p', async (amount) => {
    expect(await errorsFor({ ...bill, amount })).toEqual(['amount'])
  })

  it.each([undefined, ''])('rejects the payee %p', async (payee) => {
    expect(await errorsFor({ ...bill, payee })).toEqual(['payee'])
  })

  it.each(['2026-11-30T10:00:00Z', '30/11/2026', '2026-02-30', undefined])('rejects the due_date %p', async (due_date) => {
    expect(await errorsFor({ ...bill, due_date })).toEqual(['due_date'])
  })

  it.each(['status', 'paid_on', 'created_by'])('rejects %p in the body', async (field) => {
    expect(await errorsFor({ ...bill, [field]: 'x' })).toEqual([field])
  })
})

describe('PaymentScheduleService', () => {
  let service: PaymentScheduleService
  const db = {
    payment_schedule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    expense: { create: jest.fn() },
    staff: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  }

  beforeEach(() => {
    jest.resetAllMocks()
    db.staff.findFirst.mockResolvedValue({ id: STAFF_ID })
    // Runs the callback with the same mocks as the transaction client.
    db.$transaction.mockImplementation((work: (tx: typeof db) => unknown) => work(db))
    service = new PaymentScheduleService(db as unknown as DbService)
  })

  describe('findAll', () => {
    it('lists live schedules only, soonest due first', async () => {
      await service.findAll()

      expect(db.payment_schedule.findMany).toHaveBeenCalledWith({ where: { deleted_at: null }, orderBy: { due_date: 'asc' } })
    })

    it('filters by status', async () => {
      await service.findAll({ status: 'paid' })

      expect(db.payment_schedule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null, status: 'paid' } }))
    })

    it('treats overdue as scheduled and due before today', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 10, 15, 9, 30))

      await service.findAll({ overdue: 'true' })

      expect(db.payment_schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deleted_at: null, status: 'scheduled', due_date: { lt: new Date('2026-11-15') } } }),
      )
      jest.useRealTimers()
    })

    it('returns nothing for paid and overdue, without a query', async () => {
      expect(await service.findAll({ status: 'paid', overdue: 'true' })).toEqual([])
      expect(db.payment_schedule.findMany).not.toHaveBeenCalled()
    })
  })

  it('throws PAYMENT_SCHEDULE_NOT_FOUND for a missing or deleted schedule', async () => {
    db.payment_schedule.findFirst.mockResolvedValue(null)

    const error = await service.findOne(SCHEDULE_ID).catch((e: unknown) => e)

    expect(db.payment_schedule.findFirst).toHaveBeenCalledWith({ where: { id: SCHEDULE_ID, deleted_at: null } })
    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'PAYMENT_SCHEDULE_NOT_FOUND' })
  })

  describe('create', () => {
    it('stores the due date as a date and the staff id as created_by', async () => {
      await service.create(bill, USER_ID)

      expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER_ID, deleted_at: null } }))
      expect(db.payment_schedule.create).toHaveBeenCalledWith({
        data: { ...bill, due_date: new Date('2026-11-30'), created_by: STAFF_ID },
      })
    })

    it('refuses a user with no staff row', async () => {
      db.staff.findFirst.mockResolvedValue(null)

      await expect(service.create(bill, USER_ID)).rejects.toBeInstanceOf(ForbiddenException)
      expect(db.payment_schedule.create).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('changes a scheduled bill and sets updated_at', async () => {
      db.payment_schedule.findFirst.mockResolvedValue(scheduled)

      await service.update(SCHEDULE_ID, { amount: 260000, due_date: '2026-12-15' })

      expect(db.payment_schedule.update).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID },
        data: { amount: 260000, due_date: new Date('2026-12-15'), updated_at: expect.any(Date) },
      })
    })

    it('refuses a paid schedule with 409', async () => {
      db.payment_schedule.findFirst.mockResolvedValue(paid)

      const error = await service.update(SCHEDULE_ID, { amount: 1 }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ConflictException)
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'PAYMENT_SCHEDULE_PAID' })
      expect(db.payment_schedule.update).not.toHaveBeenCalled()
    })

    it('throws not found for a missing schedule', async () => {
      db.payment_schedule.findFirst.mockResolvedValue(null)

      await expect(service.update(SCHEDULE_ID, { amount: 1 })).rejects.toBeInstanceOf(NotFoundException)
      expect(db.payment_schedule.update).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('soft deletes a scheduled bill', async () => {
      db.payment_schedule.findFirst.mockResolvedValue(scheduled)

      await service.remove(SCHEDULE_ID)

      expect(db.payment_schedule.update).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID },
        data: { deleted_at: expect.any(Date), updated_at: expect.any(Date) },
      })
    })

    it('refuses a paid schedule with 409', async () => {
      db.payment_schedule.findFirst.mockResolvedValue(paid)

      await expect(service.remove(SCHEDULE_ID)).rejects.toBeInstanceOf(ConflictException)
      expect(db.payment_schedule.update).not.toHaveBeenCalled()
    })
  })
  describe('pay', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 10, 29, 14, 0))
      db.payment_schedule.findFirst.mockResolvedValue({ ...scheduled, description: 'Engine check' })
      db.payment_schedule.updateMany.mockResolvedValue({ count: 1 })
    })

    afterEach(() => jest.useRealTimers())

    it('marks the bill paid today and creates one matching expense, in one transaction', async () => {
      await service.pay(SCHEDULE_ID, USER_ID)

      const paidOn = new Date('2026-11-29')
      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(db.payment_schedule.updateMany).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID, status: 'scheduled', deleted_at: null },
        data: { status: 'paid', paid_on: paidOn, updated_at: expect.any(Date) },
      })
      expect(db.expense.create).toHaveBeenCalledTimes(1)
      expect(db.expense.create).toHaveBeenCalledWith({
        data: {
          category: 'maintenance',
          description: 'Thai Aero Maintenance: Engine check',
          amount: 250000,
          incurred_on: paidOn,
          payment_schedule_id: SCHEDULE_ID,
          created_by: STAFF_ID,
        },
      })
    })

    it('refuses an already paid bill with 409 and creates no expense', async () => {
      db.payment_schedule.findFirst.mockResolvedValue(paid)

      const error = await service.pay(SCHEDULE_ID, USER_ID).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ConflictException)
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'PAYMENT_SCHEDULE_PAID' })
      expect(db.expense.create).not.toHaveBeenCalled()
    })

    it("the second pay doesn't create a second expense, even when both clicks pass the first check", async () => {
      // The first click already flipped the row, so the guarded update matches nothing.
      db.payment_schedule.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.pay(SCHEDULE_ID, USER_ID)).rejects.toBeInstanceOf(ConflictException)
      expect(db.expense.create).not.toHaveBeenCalled()
    })

    it('maps the unique index on expense.payment_schedule_id to 409, not 500', async () => {
      db.expense.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

      await expect(service.pay(SCHEDULE_ID, USER_ID)).rejects.toBeInstanceOf(ConflictException)
    })

    it('throws not found for a missing or deleted bill', async () => {
      db.payment_schedule.findFirst.mockResolvedValue(null)

      await expect(service.pay(SCHEDULE_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException)
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('uses the payee alone as the expense description when the bill has none', async () => {
      db.payment_schedule.findFirst.mockResolvedValue(scheduled)

      await service.pay(SCHEDULE_ID, USER_ID)

      expect(db.expense.create).toHaveBeenCalledWith({ data: expect.objectContaining({ description: 'Thai Aero Maintenance' }) })
    })
  })
})
