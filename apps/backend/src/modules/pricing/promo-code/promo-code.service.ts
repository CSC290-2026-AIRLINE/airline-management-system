import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { PromoInvalidReason } from '../pricing.constants'
import { PricingAudit } from '../pricing.audit'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { simNow } from '../fare-quote/sim-clock'
import { CreatePromoCodeDto } from './dto/create-promo-code.dto'
import { RedeemPromoDto } from './dto/redeem-promo.dto'
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
  constructor(
    private readonly db: DbService,
    private readonly audit: PricingAudit,
  ) {}

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

  async create(dto: CreatePromoCodeDto, userId: string) {
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
      return await this.db.$transaction(async (tx) => {
        const row = await tx.promo_code.create({ data: { ...dto, valid_from: validFrom, valid_to: validTo } })
        await this.audit.write(
          userId,
          { action: 'create', entityType: 'promo_code', entityId: row.id, summary: `Created promo code ${row.code}`, after: row },
          tx,
        )
        return row
      })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  async update(id: string, dto: UpdatePromoCodeDto, userId: string) {
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
      return await this.db.$transaction(async (tx) => {
        const row = await tx.promo_code.update({
          where: { id },
          data: { ...dto, valid_from: toDate(dto.valid_from), valid_to: toDate(dto.valid_to), updated_at: new Date() },
        })
        await this.audit.write(
          userId,
          {
            action: 'update',
            entityType: 'promo_code',
            entityId: id,
            summary: `Updated promo code ${row.code}`,
            before: current,
            after: row,
          },
          tx,
        )
        return row
      })
    } catch (error) {
      throw this.mapUniqueViolation(error, dto.code)
    }
  }

  // Soft delete: quotes and redemptions keep pointing at the row; the code can be reused afterwards.
  async remove(id: string, userId: string) {
    const existing = await this.findOne(id)
    const now = new Date()
    await this.db.$transaction(async (tx) => {
      await tx.promo_code.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
      await this.audit.write(
        userId,
        { action: 'delete', entityType: 'promo_code', entityId: id, summary: `Deleted promo code ${existing.code}`, before: existing },
        tx,
      )
    })
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
        promo_redemption: { where: { status: 'redeemed' }, select: { redeemed_at: true }, take: 1 },
      },
    })
    return {
      promo_code_id: promo.id,
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

  // Feature 3b or 5a, when a booking is paid. Counts one use per booking: a repeat with the same booking_ref returns the
  // first result and counts nothing. Only "used up" refuses; the price was agreed when the quote was made, so a promo
  // switched off or expired since then still counts. The increment is conditional, so two bookings racing for the last
  // use cannot both win, and throwing rolls the redemption row back.
  async redeem(promoCodeId: string, { booking_ref, fare_quote_id }: RedeemPromoDto, userId: string | null = null) {
    const promo = await this.findOne(promoCodeId)
    const quote = await this.db.fare_quote.findUnique({ where: { id: fare_quote_id }, select: { id: true, promo_code_id: true } })
    if (!quote) {
      throw new NotFoundException(pricingError(PricingErrorCode.QUOTE_NOT_FOUND, `Fare quote ${fare_quote_id} not found`))
    }
    if (quote.promo_code_id !== promoCodeId) {
      throw this.invalid('not_found', 'This quote was not priced with that promo code')
    }

    const key = { promo_code_id: promoCodeId, booking_ref }
    return this.db.$transaction(async (tx) => {
      const existing = await tx.promo_redemption.findUnique({ where: { promo_code_id_booking_ref: key } })
      if (existing?.status === 'redeemed') {
        return this.redemptionResult(existing, true)
      }

      if (!existing) {
        const inserted = await tx.promo_redemption.createMany({
          data: [{ ...key, fare_quote_id, redeemed_at: simNow() }],
          skipDuplicates: true, // ON CONFLICT DO NOTHING: a concurrent retry got there first
        })
        if (inserted.count === 0) {
          return this.redemptionResult(await tx.promo_redemption.findUniqueOrThrow({ where: { promo_code_id_booking_ref: key } }), true)
        }
      }

      const counted = await tx.$executeRaw`
        UPDATE promo_code SET used_count = used_count + 1, updated_at = now()
        WHERE id = ${promoCodeId}::uuid AND (max_uses IS NULL OR used_count < max_uses)`
      if (counted === 0) {
        throw this.invalid('exhausted', 'This promo code has no uses left')
      }
      // A booking whose use was released (payment failed) and is paid again takes its use back.
      const row = existing
        ? await tx.promo_redemption.update({
            where: { id: existing.id },
            data: { status: 'redeemed', released_at: null, redeemed_at: simNow(), fare_quote_id },
          })
        : await tx.promo_redemption.findUniqueOrThrow({ where: { promo_code_id_booking_ref: key } })
      await this.audit.write(
        userId,
        {
          action: existing ? 'update' : 'create',
          entityType: 'promo_redemption',
          entityId: row.id,
          summary: `Redeemed promo code ${promo.code} for booking ${booking_ref}`,
          before: existing ?? undefined,
          after: row,
        },
        tx,
      )
      return this.redemptionResult(row, false)
    })
  }

  // When the booking is refunded or payment fails. Safe to retry: releasing a released use does nothing.
  async release(promoCodeId: string, bookingRef: string, userId: string | null = null) {
    const key = { promo_code_id: promoCodeId, booking_ref: bookingRef }
    await this.db.$transaction(async (tx) => {
      const existing = await tx.promo_redemption.findUnique({ where: { promo_code_id_booking_ref: key } })
      if (!existing) {
        throw new NotFoundException(
          pricingError(PricingErrorCode.PROMO_REDEMPTION_NOT_FOUND, `No use of this promo code for booking ${bookingRef}`),
        )
      }
      if (existing.status === 'released') return
      const released = await tx.promo_redemption.update({ where: { id: existing.id }, data: { status: 'released', released_at: simNow() } })
      await this.audit.write(
        userId,
        {
          action: 'update',
          entityType: 'promo_redemption',
          entityId: existing.id,
          summary: `Released promo code use for booking ${bookingRef}`,
          before: existing,
          after: released,
        },
        tx,
      )
      await tx.$executeRaw`UPDATE promo_code SET used_count = GREATEST(used_count - 1, 0), updated_at = now() WHERE id = ${promoCodeId}::uuid`
    })
  }

  private redemptionResult(
    row: { promo_code_id: string; booking_ref: string; fare_quote_id: string; status: string; redeemed_at: Date },
    alreadyRedeemed: boolean,
  ) {
    return {
      promo_code_id: row.promo_code_id,
      booking_ref: row.booking_ref,
      fare_quote_id: row.fare_quote_id,
      status: row.status,
      redeemed_at: row.redeemed_at,
      already_redeemed: alreadyRedeemed,
    }
  }

  // Used by fare quotes. Returns the live promo for a code typed at checkout, or throws PROMO_INVALID with the reason.
  // The caller passes the simulation time, because validity follows the simulation clock, not the real one.
  async checkPromo(code: string, simNow: Date) {
    const typed = code.trim().toUpperCase()
    const promo = await this.db.promo_code.findFirst({ where: { code: typed, deleted_at: null } })
    if (!promo) throw this.invalid('not_found', `Promo code ${typed} does not exist`)
    if (!promo.is_active) throw this.invalid('inactive', `Promo code ${typed} is not active`)
    if (simNow < promo.valid_from) throw this.invalid('not_started', `Promo code ${typed} is not valid yet`)
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
