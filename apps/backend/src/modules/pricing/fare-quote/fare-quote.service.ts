import { BadGatewayException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FareClassService } from '../fare-class/fare-class.service'
import { FARE_RULE_FIELDS, type SeatType } from '../pricing.constants'
import { PricingErrorCode, pricingError } from '../pricing.errors'
import { PricingRuleService } from '../pricing-rule/pricing-rule.service'
import { PromoCodeService } from '../promo-code/promo-code.service'
import { SeatFeeService } from '../seat-fee/seat-fee.service'
import { SettingService } from '../setting/setting.service'
import { TaxFeeService } from '../tax-fee/tax-fee.service'
import { CreateFareQuoteDto } from './dto/create-fare-quote.dto'
import type { QuoteFeeType } from './dto/quote-fee.dto'
import { buildQuoteLines, feeCents, toCents, type QuoteLine } from './quote-calculator'
import { SeatAvailability } from './seat-availability'
import { daysBetween, localDate, simNow } from './sim-clock'

// The flight statuses a ticket can still be sold on. A closed list, so a status Feature 2 adds later is refused until
// someone decides. holding and diverted are aircraft already in the air.
const BOOKABLE_STATUSES: readonly string[] = ['scheduled', 'delayed']

const WITH_LINES = { fare_quote_line: { orderBy: { seq: 'asc' } } } as const

type FareRuleSnapshot = Record<(typeof FARE_RULE_FIELDS)[number], number | boolean>

// What makes two quotes the same price. Empty values match each other (Prisma's null is IS NULL: IS NOT DISTINCT FROM).
interface QuoteKey {
  flight_id: string
  fare_class_id: string
  promo_code_id: string | null
  seat_type: SeatType | null
}

function presentQuote<T extends { fare_quote_line: unknown[] }>({ fare_quote_line, ...quote }: T) {
  return { ...quote, lines: fare_quote_line }
}

function lineRow(line: QuoteLine, index: number) {
  return {
    seq: index + 1,
    kind: line.kind,
    label: line.label,
    rate_pct: line.ratePct,
    amount: line.amountCents / 100,
    source_id: line.sourceId,
  }
}

@Injectable()
export class FareQuoteService {
  constructor(
    private readonly db: DbService,
    private readonly fareClasses: FareClassService,
    private readonly pricingRules: PricingRuleService,
    private readonly promoCodes: PromoCodeService,
    private readonly seatFees: SeatFeeService,
    private readonly taxFees: TaxFeeService,
    private readonly settings: SettingService,
    private readonly seatAvailability: SeatAvailability,
  ) {}

  // Returns the live shared quote for this key, or works out and saves a new one. The price is shared by everyone
  // looking at the same flight, class, promo and seat type until it expires; it is not a seat hold.
  //
  // Every check that can refuse a sale runs before the reuse lookup, even though the guide lists some of them under the
  // calculation: a saved quote must not keep selling a flight just cancelled or a promo just switched off.
  async create(dto: CreateFareQuoteDto) {
    const now = simNow()
    const flight = await this.findBookableFlight(dto.flight_id, now)
    const fareClass = await this.findSellableClass(dto.fare_class_id)

    const timeZone = flight.route.airport_route_originToairport.timezone
    const departureDate = localDate(flight.dep_at, timeZone)
    const daysToDeparture = daysBetween(localDate(now, timeZone), departureDate)
    if (daysToDeparture < fareClass.min_advance_purchase_days) {
      throw new UnprocessableEntityException(
        pricingError(
          PricingErrorCode.ADVANCE_PURCHASE_REQUIRED,
          `${fareClass.code} must be bought at least ${fareClass.min_advance_purchase_days} days before departure`,
          { min_advance_purchase_days: fareClass.min_advance_purchase_days, days_to_departure: daysToDeparture },
        ),
      )
    }

    const promo = dto.promo_code ? await this.promoCodes.checkPromo(dto.promo_code, now) : null
    const key: QuoteKey = {
      flight_id: flight.id,
      fare_class_id: fareClass.id,
      promo_code_id: promo?.id ?? null,
      seat_type: dto.seat_type ?? null,
    }

    const live = await this.findLiveQuote(this.db, key, now)
    if (live) return presentQuote(live)

    const seatsLeftPct = await this.readSeatsLeftPct(flight.id)
    const baseFare = await this.db.base_fare.findFirst({
      where: { route_id: flight.route_id, fare_class_id: fareClass.id, deleted_at: null },
    })
    if (!baseFare) {
      throw new UnprocessableEntityException(
        pricingError(PricingErrorCode.BASE_FARE_MISSING, `Fare class ${fareClass.code} has no base fare on this route`),
      )
    }

    const baseAmount = Number(baseFare.amount)
    const [ruled, seatFee, taxes, currency, holdMinutes] = await Promise.all([
      this.pricingRules.applyRules(baseAmount, { fareClassId: fareClass.id, daysToDeparture, seatsLeftPct, departureDate }),
      dto.seat_type ? this.seatFees.lookup(fareClass.cabin, dto.seat_type) : null,
      this.taxFees.findAll(),
      this.settings.getBaseCurrency(),
      this.settings.getQuoteHoldMinutes(),
    ])

    const { lines, totalCents } = buildQuoteLines({
      baseCents: toCents(baseAmount),
      rules: ruled.applied,
      seatFee: seatFee && dto.seat_type ? { label: `Seat fee (${dto.seat_type})`, cents: toCents(Number(seatFee.amount)) } : undefined,
      promo: promo
        ? {
            id: promo.id,
            code: promo.code,
            discount_pct: promo.discount_pct === null ? null : Number(promo.discount_pct),
            discount_amount: promo.discount_amount === null ? null : Number(promo.discount_amount),
          }
        : undefined,
      taxes: taxes.map((tax) => ({ id: tax.id, name: tax.name, kind: tax.kind, calc_type: tax.calc_type, value: Number(tax.value) })),
    })

    const snapshot = Object.fromEntries(
      FARE_RULE_FIELDS.map((field) => {
        const value = fareClass[field]
        return [field, typeof value === 'boolean' ? value : Number(value)]
      }),
    ) as FareRuleSnapshot

    // One transaction, so a quote is never saved without its lines. The lock makes two identical requests take turns:
    // the second finds the first one's quote instead of adding a duplicate.
    const saved = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(key)}, 0))`
      const winner = await this.findLiveQuote(tx, key, now)
      if (winner) return winner
      return tx.fare_quote.create({
        data: {
          ...key,
          currency,
          total_amount: totalCents / 100,
          seats_left_pct: seatsLeftPct,
          days_to_departure: daysToDeparture,
          fare_rule_snapshot: snapshot,
          quoted_at: now,
          expires_at: new Date(now.getTime() + holdMinutes * 60_000),
          fare_quote_line: { create: lines.map(lineRow) },
        },
        include: WITH_LINES,
      })
    })
    return presentQuote(saved)
  }

  async findOne(id: string) {
    return presentQuote(await this.findQuote(id))
  }

  // For Feature 5b. Always from the snapshot frozen on the quote, never the live fare class, so a later change to the
  // fees cannot touch a booking already made.
  async fee(id: string, type: QuoteFeeType) {
    const quote = await this.findQuote(id)
    const rules = quote.fare_rule_snapshot as FareRuleSnapshot
    const isCancel = type === 'cancel'
    const allowed = Boolean(isCancel ? rules.refundable : rules.changeable)
    const flat = Number(isCancel ? rules.cancel_fee_flat : rules.change_fee_flat)
    const pct = Number(isCancel ? rules.cancel_fee_pct : rules.change_fee_pct)

    return {
      fare_quote_id: quote.id,
      type,
      allowed,
      flat,
      pct,
      fee: allowed ? feeCents(toCents(Number(quote.total_amount)), flat, pct) / 100 : null, // null: not refundable or changeable
      currency: quote.currency,
    }
  }

  // Called by Feature 3b when a booking is confirmed. Safe to retry: the use is counted once per quote. A quote with no
  // promo is a no-op rather than an error, so 3b can call this on every confirmation without checking first.
  //
  // Only "used up" refuses. The price was agreed when the quote was made, so a promo switched off or expired since then
  // still counts. The increment is conditional rather than relying on the CHECK on used_count, so two bookings racing
  // for the last use cannot both win, and throwing rolls the redemption row back.
  async redeem(id: string) {
    const quote = await this.findQuote(id)
    const promoCodeId = quote.promo_code_id
    if (!promoCodeId) {
      return { fare_quote_id: quote.id, promo_code_id: null, redeemed: false, already_redeemed: false }
    }

    const { count } = await this.db.$transaction(async (tx) => {
      const inserted = await tx.promo_redemption.createMany({
        data: [{ promo_code_id: promoCodeId, fare_quote_id: quote.id, redeemed_at: simNow() }],
        skipDuplicates: true, // ON CONFLICT DO NOTHING
      })
      if (inserted.count === 0) return inserted

      const counted = await tx.$executeRaw`
        UPDATE promo_code SET used_count = used_count + 1, updated_at = now()
        WHERE id = ${promoCodeId}::uuid AND (max_uses IS NULL OR used_count < max_uses)`
      if (counted === 0) {
        throw new UnprocessableEntityException(
          pricingError(PricingErrorCode.PROMO_INVALID, 'This promo code has no uses left', { reason: 'exhausted' }),
        )
      }
      return inserted
    })

    return { fare_quote_id: quote.id, promo_code_id: promoCodeId, redeemed: true, already_redeemed: count === 0 }
  }

  private async findQuote(id: string) {
    const quote = await this.db.fare_quote.findUnique({ where: { id }, include: WITH_LINES })
    if (!quote) {
      throw new NotFoundException(pricingError(PricingErrorCode.FARE_QUOTE_NOT_FOUND, `Fare quote ${id} not found`))
    }
    return quote
  }

  // quoted_at <= now as well as now < expires_at, so rewinding the simulation clock cannot revive an old quote.
  private findLiveQuote(db: Pick<DbService, 'fare_quote'>, key: QuoteKey, now: Date) {
    return db.fare_quote.findFirst({
      where: { ...key, quoted_at: { lte: now }, expires_at: { gt: now } },
      orderBy: { quoted_at: 'desc' },
      include: WITH_LINES,
    })
  }

  // `flight`, `route` and `airport` belong to Feature 2 and are only read here.
  private async findBookableFlight(id: string, now: Date) {
    const flight = await this.db.flight.findUnique({
      where: { id },
      select: {
        id: true,
        route_id: true,
        dep_at: true,
        status: true,
        route: { select: { airport_route_originToairport: { select: { timezone: true } } } },
      },
    })
    if (!flight) {
      throw new NotFoundException(pricingError(PricingErrorCode.FLIGHT_NOT_FOUND, `Flight ${id} not found`))
    }
    if (!BOOKABLE_STATUSES.includes(flight.status) || flight.dep_at <= now) {
      throw new ConflictException(
        pricingError(PricingErrorCode.FLIGHT_NOT_BOOKABLE, 'This flight can no longer be booked', { status: flight.status }),
      )
    }
    return flight
  }

  private async findSellableClass(id: string) {
    const fareClass = await this.fareClasses.findOne(id)
    if (!fareClass.is_active) {
      throw new NotFoundException(pricingError(PricingErrorCode.FARE_CLASS_NOT_FOUND, `Fare class ${id} not found`))
    }
    return fareClass
  }

  private async readSeatsLeftPct(flightId: string) {
    let seatsLeftPct: number
    try {
      seatsLeftPct = await this.seatAvailability.seatsLeftPct(flightId)
    } catch {
      throw this.upstreamUnavailable()
    }
    if (!Number.isFinite(seatsLeftPct) || seatsLeftPct < 0 || seatsLeftPct > 100) {
      throw this.upstreamUnavailable() // a bad answer must not reach a saved price
    }
    return seatsLeftPct
  }

  private upstreamUnavailable() {
    return new BadGatewayException(pricingError(PricingErrorCode.UPSTREAM_UNAVAILABLE, 'Seat availability is not available right now'))
  }
}
