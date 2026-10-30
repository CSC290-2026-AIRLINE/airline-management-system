import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { PromoInvalidReason } from '../pricing.constants'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { CreatePromoCodeDto } from './dto/create-promo-code.dto'
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto'

// The row as it will be after a create or update, for the checks that span several fields.
interface PromoValues {
  discount_pct: number | null
  discount_amount: number | null
  valid_from: Date
  valid_to: Date
  max_uses: number | null
  used_count: number
}

function toDate(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value)
}

// The newest quotes are the ones staff are looking for; a busy code can have thousands.
const QUOTE_LIST_LIMIT = 50

function numberOrNull(value: { toString(): string } | null): number | null {
  return value === null ? null : Number(value)
}

@Injectable()
export class PromoCodeService {
  constructor(private readonly db: DbService) {}

  // Inactive codes are hidden unless asked for, like fare classes and taxes.
  findAll(includeInactive = false) {
    return this.db.promo_code.findMany({
      where: { deleted_at: null, ...(includeInactive ? {} : { is_active: true }) },
      orderBy: { code: 'asc' },
    })
  }

  async findOne(id: string) {
    const promo = await this.db.promo_code.findFirst({ where: { id, deleted_at: null } })
    if (!promo) {
      throw new NotFoundException(pricingError(PricingErrorCode.PROMO_CODE_NOT_FOUND, `Promo code ${id} not found`))
    }
    return promo
  }

  async create(dto: CreatePromoCodeDto) {
    const validFrom = new Date(dto.valid_from)
    const validTo = new Date(dto.valid_to)
    this.assertValues({
      discount_pct: dto.discount_pct ?? null,
      discount_amount: dto.discount_amount ?? null,
      valid_from: validFrom,
      valid_to: validTo,
      max_uses: dto.max_uses ?? null,
      used_count: 0,
    })
    await this.assertCodeFree(dto.code)
    try {
      return await this.db.promo_code.create({ data: { ...dto, valid_from: validFrom, valid_to: validTo } })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  async update(id: string, dto: UpdatePromoCodeDto) {
    const current = await this.findOne(id)
    // Checked on the row as it will be after the change. Sending null clears a field, so switching a code from a
    // percentage to a fixed amount is { discount_pct: null, discount_amount: 50 }.
    this.assertValues({
      discount_pct: dto.discount_pct !== undefined ? dto.discount_pct : numberOrNull(current.discount_pct),
      discount_amount: dto.discount_amount !== undefined ? dto.discount_amount : numberOrNull(current.discount_amount),
      valid_from: toDate(dto.valid_from) ?? current.valid_from,
      valid_to: toDate(dto.valid_to) ?? current.valid_to,
      max_uses: dto.max_uses !== undefined ? dto.max_uses : current.max_uses,
      used_count: current.used_count,
    })
    if (dto.code && dto.code !== current.code) {
      await this.assertCodeFree(dto.code, id)
    }
    try {
      return await this.db.promo_code.update({
        where: { id },
        data: { ...dto, valid_from: toDate(dto.valid_from), valid_to: toDate(dto.valid_to), updated_at: new Date() },
      })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  // Soft delete: quotes and redemptions keep pointing at the row; the code can be reused afterwards.
  async remove(id: string) {
    await this.findOne(id)
    const now = new Date()
    await this.db.promo_code.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
  }

  // The quotes carrying a code, for the Redeem card: staff know the code, never the quote id. `flight` and `route` belong
  // to Feature 2 and are only read here.
  async findQuotes(code: string) {
    const typed = code.trim().toUpperCase()
    const promo = await this.db.promo_code.findFirst({ where: { code: typed, deleted_at: null }, select: { id: true, code: true } })
    if (!promo) {
      throw new NotFoundException(pricingError(PricingErrorCode.PROMO_CODE_NOT_FOUND, `Promo code ${typed} not found`))
    }
    const quotes = await this.db.fare_quote.findMany({
      where: { promo_code_id: promo.id },
      orderBy: { quoted_at: 'desc' },
      take: QUOTE_LIST_LIMIT,
      select: {
        id: true,
        seat_type: true,
        total_amount: true,
        currency: true,
        quoted_at: true,
        fare_class: { select: { code: true } },
        flight: { select: { flight_number: true, dep_at: true, route: { select: { origin: true, destination: true } } } },
        promo_redemption: { select: { redeemed_at: true } },
      },
    })
    return {
      code: promo.code,
      quotes: quotes.map(({ fare_class, flight, promo_redemption, ...quote }) => ({
        ...quote,
        fare_class_code: fare_class.code,
        flight_number: flight.flight_number,
        departs_at: flight.dep_at,
        origin: flight.route.origin,
        destination: flight.route.destination,
        redeemed_at: promo_redemption[0]?.redeemed_at ?? null,
      })),
    }
  }

  // Used by fare quotes. Returns the live promo for a code typed at checkout, or throws PROMO_INVALID with the reason.
  // The caller passes the simulation time, because validity follows the simulation clock, not the real one.
  async checkPromo(code: string, simNow: Date) {
    const typed = code.trim().toUpperCase()
    const promo = await this.db.promo_code.findFirst({ where: { code: typed, deleted_at: null } })
    if (!promo) throw this.invalid('unknown', `Promo code ${typed} does not exist`)
    if (!promo.is_active) throw this.invalid('inactive', `Promo code ${typed} is not active`)
    if (simNow < promo.valid_from) throw this.invalid('not_yet_valid', `Promo code ${typed} is not valid yet`)
    if (simNow >= promo.valid_to) throw this.invalid('expired', `Promo code ${typed} has expired`)
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      throw this.invalid('exhausted', `Promo code ${typed} has no uses left`)
    }
    return promo
  }

  private invalid(reason: PromoInvalidReason, message: string) {
    return new UnprocessableEntityException(pricingError(PricingErrorCode.PROMO_INVALID, message, { reason }))
  }

  // The database CHECKs cover these too; checking first gives a 400 that names the fields instead of a 500.
  private assertValues(values: PromoValues) {
    const problems: string[] = []
    const fields: string[] = []
    const flag = (message: string, ...names: string[]) => {
      problems.push(message)
      fields.push(...names)
    }

    if ((values.discount_pct === null) === (values.discount_amount === null)) {
      flag('set exactly one of discount_pct or discount_amount', 'discount_pct', 'discount_amount')
    }
    if (values.valid_from >= values.valid_to) {
      flag('valid_from must be before valid_to', 'valid_from', 'valid_to')
    }
    if (values.max_uses !== null && values.max_uses < values.used_count) {
      flag(`max_uses cannot be below the ${values.used_count} uses already counted`, 'max_uses')
    }

    if (problems.length) {
      throw new BadRequestException(pricingError(PricingErrorCode.PROMO_CODE_INVALID, problems.join('; '), { fields }))
    }
  }

  private async assertCodeFree(code: string, excludeId?: string) {
    const existing = await this.db.promo_code.findFirst({
      where: { code, deleted_at: null, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    })
    if (existing) {
      throw this.codeTaken(code, existing.id)
    }
  }

  // Two requests can both pass assertCodeFree; the partial unique index catches the second one (P2002).
  private mapUniqueViolation(error: unknown, code?: string) {
    return isUniqueViolation(error) ? this.codeTaken(code) : error
  }

  private codeTaken(code?: string, existingId?: string) {
    return new ConflictException(
      pricingError(
        PricingErrorCode.PROMO_CODE_TAKEN,
        `Promo code ${code ?? ''} already exists`,
        existingId ? { promo_code_id: existingId } : undefined,
      ),
    )
  }
}
