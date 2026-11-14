import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingAudit } from '../../pricing.audit'
import { PricingErrorCode, pricingError } from '../../pricing.errors'
import { staffIdFor } from '../../pricing.staff'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { ListExpensesDto } from './dto/list-expenses.dto'
import { UpdateExpenseDto } from './dto/update-expense.dto'

@Injectable()
export class ExpenseService {
  constructor(
    private readonly db: DbService,
    private readonly audit: PricingAudit,
  ) {}

  findAll({ month, category }: ListExpensesDto = {}) {
    return this.db.expense.findMany({
      where: { deleted_at: null, ...(month && { incurred_on: monthRange(month) }), ...(category && { category }) },
      orderBy: [{ incurred_on: 'asc' }, { created_at: 'asc' }],
    })
  }

  async findOne(id: string) {
    const expense = await this.db.expense.findFirst({ where: { id, deleted_at: null } })
    if (!expense) {
      throw new NotFoundException(pricingError(PricingErrorCode.EXPENSE_NOT_FOUND, `Expense ${id} not found`))
    }
    return expense
  }

  async create(dto: CreateExpenseDto, userId: string) {
    const staffId = await staffIdFor(this.db, userId)
    return this.db.$transaction(async (tx) => {
      const row = await tx.expense.create({ data: { ...dto, incurred_on: new Date(dto.incurred_on), created_by: staffId } })
      await this.audit.write(
        userId,
        {
          action: 'create',
          entityType: 'expense',
          entityId: row.id,
          summary: `Created expense ${row.description ?? row.category}`,
          after: row,
        },
        tx,
      )
      return row
    })
  }

  async update(id: string, dto: UpdateExpenseDto, userId: string) {
    const existing = await this.findManual(id)
    return this.db.$transaction(async (tx) => {
      const row = await tx.expense.update({
        where: { id },
        data: { ...dto, ...(dto.incurred_on && { incurred_on: new Date(dto.incurred_on) }), updated_at: new Date() },
      })
      await this.audit.write(
        userId,
        {
          action: 'update',
          entityType: 'expense',
          entityId: id,
          summary: `Updated expense ${row.description ?? row.category}`,
          before: existing,
          after: row,
        },
        tx,
      )
      return row
    })
  }

  async remove(id: string, userId: string) {
    const existing = await this.findManual(id)
    const now = new Date()
    await this.db.$transaction(async (tx) => {
      await tx.expense.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
      await this.audit.write(
        userId,
        {
          action: 'delete',
          entityType: 'expense',
          entityId: id,
          summary: `Deleted expense ${existing.description ?? existing.category}`,
          before: existing,
        },
        tx,
      )
    })
  }

  // An expense from "mark paid" mirrors its paid schedule, so it is fixed through the schedule, never directly.
  private async findManual(id: string) {
    const expense = await this.findOne(id)
    if (expense.payment_schedule_id) {
      throw new ConflictException(
        pricingError(PricingErrorCode.EXPENSE_FROM_SCHEDULE, 'This expense was created by paying a schedule and cannot be changed'),
      )
    }
    return expense
  }
}

// '2026-11' → incurred_on from 1 Nov up to (not including) 1 Dec.
function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return { gte: new Date(Date.UTC(year, monthNumber - 1, 1)), lt: new Date(Date.UTC(year, monthNumber, 1)) }
}
