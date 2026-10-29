import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../../pricing.errors'
import { staffIdFor } from '../../pricing.staff'
import { simulatedToday } from '../finance.constants'
import { CreatePaymentScheduleDto } from './dto/create-payment-schedule.dto'
import { ListPaymentSchedulesDto } from './dto/list-payment-schedules.dto'
import { UpdatePaymentScheduleDto } from './dto/update-payment-schedule.dto'

@Injectable()
export class PaymentScheduleService {
  constructor(private readonly db: DbService) {}

  // Overdue = still scheduled and due before today, so ?status=paid&overdue=true can never match.
  findAll({ status, overdue }: ListPaymentSchedulesDto = {}) {
    if (overdue === 'true' && status === 'paid') {
      return Promise.resolve([])
    }
    return this.db.payment_schedule.findMany({
      where: {
        deleted_at: null,
        ...(status && { status }),
        ...(overdue === 'true' && { status: 'scheduled', due_date: { lt: simulatedToday() } }),
      },
      orderBy: { due_date: 'asc' },
    })
  }

  async findOne(id: string) {
    const schedule = await this.db.payment_schedule.findFirst({ where: { id, deleted_at: null } })
    if (!schedule) {
      throw new NotFoundException(pricingError(PricingErrorCode.PAYMENT_SCHEDULE_NOT_FOUND, `Payment schedule ${id} not found`))
    }
    return schedule
  }

  async create(dto: CreatePaymentScheduleDto, userId: string) {
    const staffId = await staffIdFor(this.db, userId)
    return this.db.payment_schedule.create({ data: { ...dto, due_date: new Date(dto.due_date), created_by: staffId } })
  }

  async update(id: string, dto: UpdatePaymentScheduleDto) {
    await this.findUnpaid(id)
    return this.db.payment_schedule.update({
      where: { id },
      data: { ...dto, ...(dto.due_date && { due_date: new Date(dto.due_date) }), updated_at: new Date() },
    })
  }

  // Soft delete: a deleted bill stays in the table but drops out of every list.
  async remove(id: string) {
    await this.findUnpaid(id)
    const now = new Date()
    await this.db.payment_schedule.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
  }

  // Marks the bill paid and records the matching expense in one transaction, so the books never show only one of them.
  async pay(id: string, userId: string) {
    const staffId = await staffIdFor(this.db, userId)
    const schedule = await this.findUnpaid(id)
    const paidOn = simulatedToday()
    try {
      return await this.db.$transaction(async (tx) => {
        // Only flips a bill that is still scheduled, so a second click that got past findUnpaid changes nothing.
        const { count } = await tx.payment_schedule.updateMany({
          where: { id, status: 'scheduled', deleted_at: null },
          data: { status: 'paid', paid_on: paidOn, updated_at: new Date() },
        })
        if (count === 0) {
          throw alreadyPaid()
        }
        await tx.expense.create({
          data: {
            category: schedule.category,
            description: schedule.description ? `${schedule.payee}: ${schedule.description}` : schedule.payee,
            amount: schedule.amount,
            incurred_on: paidOn,
            payment_schedule_id: id,
            created_by: staffId,
          },
        })
        return tx.payment_schedule.findUniqueOrThrow({ where: { id }, include: { expense: true } })
      })
    } catch (error) {
      // The unique index on expense.payment_schedule_id is the last guard against a second expense (P2002).
      throw isUniqueViolation(error) ? alreadyPaid() : error
    }
  }

  // A paid schedule is history: its expense already exists, so it can't change.
  private async findUnpaid(id: string) {
    const schedule = await this.findOne(id)
    if (schedule.status === 'paid') {
      throw alreadyPaid()
    }
    return schedule
  }
}

function alreadyPaid() {
  return new ConflictException(
    pricingError(PricingErrorCode.PAYMENT_SCHEDULE_PAID, 'Payment schedule is already paid and can no longer be changed'),
  )
}
