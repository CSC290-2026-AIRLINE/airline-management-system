import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { percentOfCents } from '../pricing-rule/pricing-rule.engine'
import { SettingService } from '../setting/setting.service'
import { TaxFeeService } from '../tax-fee/tax-fee.service'
import { CreateSeatFeeDto } from './dto/create-seat-fee.dto'
import { UpdateSeatFeeDto } from './dto/update-seat-fee.dto'

@Injectable()
export class SeatFeeService {
  constructor(
    private readonly db: DbService,
    private readonly taxFees: TaxFeeService,
    private readonly settings: SettingService,
  ) {}

  findAll() {
    return this.db.seat_fee.findMany({
      where: { deleted_at: null },
      orderBy: [{ cabin: 'asc' }, { seat_type: 'asc' }],
    })
  }

  async findOne(id: string) {
    const seatFee = await this.db.seat_fee.findFirst({ where: { id, deleted_at: null } })
    if (!seatFee) {
      throw new NotFoundException(pricingError(PricingErrorCode.SEAT_FEE_NOT_FOUND, `Seat fee ${id} not found`))
    }
    return seatFee
  }

  // What a seat choice costs at check-in; stores nothing. On an upgrade (`fromSeatType` given) the passenger pays the
  // difference between the new and the current seat type, never less than 0. Percent taxes apply to that amount; flat
  // per-leg taxes were already charged with the ticket, so they are not charged again.
  async price(cabin: string, seatType: string, fromSeatType?: string) {
    const [target, current, taxes, currency] = await Promise.all([
      this.lookup(cabin, seatType),
      fromSeatType ? this.lookup(cabin, fromSeatType) : null,
      this.taxFees.findAll(),
      this.settings.getBaseCurrency(),
    ])
    const amountCents = Math.max(Math.round(Number(target.amount) * 100) - Math.round(Number(current?.amount ?? 0) * 100), 0)
    const taxLines = taxes
      .filter((tax) => tax.calc_type === 'pct')
      .map((tax) => ({
        code: tax.code,
        name: tax.name,
        kind: tax.kind,
        rate_pct: Number(tax.value),
        amount: percentOfCents(amountCents, Number(tax.value)) / 100,
      }))
    const taxCents = taxLines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0)
    return {
      cabin,
      seat_type: seatType,
      from_seat_type: fromSeatType ?? null,
      amount: amountCents / 100,
      currency,
      taxes: taxLines,
      total: (amountCents + taxCents) / 100,
    }
  }

  async lookup(cabin: string, seatType: string) {
    const seatFee = await this.db.seat_fee.findFirst({ where: { cabin, seat_type: seatType, deleted_at: null } })
    if (!seatFee) {
      throw new NotFoundException(pricingError(PricingErrorCode.SEAT_FEE_NOT_FOUND, `No seat fee for ${cabin} / ${seatType}`))
    }
    return seatFee
  }

  async create(dto: CreateSeatFeeDto) {
    await this.assertPairFree(dto.cabin, dto.seat_type)
    try {
      return await this.db.seat_fee.create({ data: dto })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.cabin, dto.seat_type)
    }
  }

  async update(id: string, dto: UpdateSeatFeeDto) {
    const existing = await this.findOne(id)
    // Check the final pair, since changing only cabin or only seat_type can still collide with another row.
    const cabin = dto.cabin ?? existing.cabin
    const seatType = dto.seat_type ?? existing.seat_type
    if (dto.cabin || dto.seat_type) {
      await this.assertPairFree(cabin, seatType, id)
    }
    try {
      return await this.db.seat_fee.update({ where: { id }, data: { ...dto, updated_at: new Date() } })
    } catch (error) {
      throw this.mapUniqueViolation(error, cabin, seatType)
    }
  }

  // Soft delete: the same cabin + seat type can be added again afterwards (the unique index only covers live rows).
  async remove(id: string) {
    await this.findOne(id)
    const now = new Date()
    await this.db.seat_fee.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
  }

  private async assertPairFree(cabin: string, seatType: string, excludeId?: string) {
    const existing = await this.db.seat_fee.findFirst({
      where: { cabin, seat_type: seatType, deleted_at: null, ...(excludeId && { id: { not: excludeId } }) },
    })
    if (existing) {
      throw new ConflictException(pricingError(PricingErrorCode.SEAT_FEE_EXISTS, `A seat fee for ${cabin} / ${seatType} already exists`))
    }
  }

  // Two requests can both pass assertPairFree; the DB unique index catches the second one (P2002).
  private mapUniqueViolation(error: unknown, cabin: string, seatType: string) {
    if (isUniqueViolation(error)) {
      return new ConflictException(pricingError(PricingErrorCode.SEAT_FEE_EXISTS, `A seat fee for ${cabin} / ${seatType} already exists`))
    }
    return error
  }
}
