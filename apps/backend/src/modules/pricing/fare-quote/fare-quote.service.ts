import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FareClassService } from '../fare-class/fare-class.service'
import { CurrencyRateService } from '../currency-rate/currency-rate.service'
import { FARE_RULE_FIELDS, SEAT_TYPES, type SeatType } from '../pricing.constants'
import { PricingAudit } from '../pricing.audit'
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

function presentQuote<T extends { fare_quote_line: unknown[] }>(
  { fare_quote_line, ...quote }: T,
  display?: { currency: string; total_amount: number },
) {
  return { ...quote, lines: fare_quote_line, ...(display && { display }) }
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
    private readonly currencyRates: CurrencyRateService,
    private readonly audit: PricingAudit,
  ) {}

  // Returns the live shared quote for this key, or works out and saves a new one. The price is shared by everyone
  // looking at the same flight, class, promo and seat type until it expires; it is not a seat hold.
  //
  // Every check that can refuse a sale runs before the reuse lookup, even though the guide lists some of them under the
  // calculation: a saved quote must not keep selling a flight just cancelled or a promo just switched off.
  async create(dto: CreateFareQuoteDto, userId: string | null = null) {
    const now = simNow()
    const seatType = this.checkSeatType(dto.seat_type)
    await this.checkDisplayCurrency(dto.display_currency)
    const flight = await this.findBookableFlight(dto.flight_id, now)
    const fareClass = await this.findSellableClass(dto.fare_class_id)

    const timeZone = flight.route.airport_route_originToairport.timezone
    const departureDate = localDate(flight.dep_at, timeZone)
    const daysToDeparture = daysBetween(localDate(now, timeZone), departureDate)
    if (daysToDeparture < fareClass.min_advance_purchase_days) {
      throw new UnprocessableEntityException(
        pricingError(
          PricingErrorCode.FARE_ADVANCE_PURCHASE_NOT_MET,
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
      seat_type: seatType,
    }

    const live = await this.findLiveQuote(this.db, key, now)
    if (live) return presentQuote(live, await this.displayTotal(live, dto.display_currency))

    // Only a new quote asks 3b: reusing a saved one calls nothing. A sold-out class is refused here.
    const seatsLeftPct = await this.readSeatsLeftPct(flight.id)
    if (seatsLeftPct <= 0) {
      throw new ConflictException(pricingError(PricingErrorCode.FARE_CLASS_UNAVAILABLE, 'No seats are left in this fare class'))
    }
    const baseFare = await this.db.base_fare.findFirst({
      where: { route_id: flight.route_id, fare_class_id: fareClass.id, deleted_at: null },
    })
    if (!baseFare) {
      throw new UnprocessableEntityException(
        pricingError(PricingErrorCode.BASE_FARE_NOT_FOUND, `Fare class ${fareClass.code} has no base fare on this route`),
      )
    }

    const baseAmount = Number(baseFare.amount)
    const [ruled, seatFee, taxes, currency, holdMinutes] = await Promise.all([
      this.pricingRules.applyRules(baseAmount, { fareClassId: fareClass.id, daysToDeparture, seatsLeftPct, departureDate }),
      seatType ? this.lookupSeatFee(fareClass.cabin, seatType) : null,
      this.taxFees.findAll(),
      this.settings.getBaseCurrency(),
      this.settings.getQuoteHoldMinutes(),
    ])

    const { lines, totalCents } = buildQuoteLines({
      baseCents: toCents(baseAmount),
      rules: ruled.applied,
      seatFee: seatFee && seatType ? { label: `Seat fee (${seatType})`, cents: toCents(Number(seatFee.amount)) } : undefined,
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
      const created = await tx.fare_quote.create({
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
      // Only a quote that was really created is audited; a reused one (the winner above) is not a new change.
      await this.audit.write(
        userId,
        {
          action: 'create',
          entityType: 'fare_quote',
          entityId: created.id,
          summary: `Priced a fare quote of ${totalCents / 100} ${currency}`,
          after: { ...key, currency, total_amount: totalCents / 100, expires_at: created.expires_at },
        },
        tx,
      )
      return created
    })
    return presentQuote(saved, await this.displayTotal(saved, dto.display_currency))
  }

  // An expired quote is 410, as the doc has it. /fee still works on one: 5b acts on a booking made earlier.
  async findOne(id: string, displayCurrency?: string) {
    const quote = await this.findQuote(id)
    if (quote.expires_at <= simNow()) {
      throw new GoneException(pricingError(PricingErrorCode.QUOTE_EXPIRED, 'This quote has expired', { expires_at: quote.expires_at }))
    }
    await this.checkDisplayCurrency(displayCurrency)
    return presentQuote(quote, await this.displayTotal(quote, displayCurrency))
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

  private checkSeatType(seatType: string | undefined): SeatType | null {
    if (seatType === undefined) return null
    if (!(SEAT_TYPES as readonly string[]).includes(seatType)) {
      throw new UnprocessableEntityException(
        pricingError(PricingErrorCode.SEAT_TYPE_UNKNOWN, `Unknown seat type ${seatType}`, { allowed: SEAT_TYPES }),
      )
    }
    return seatType as SeatType
  }

  // A seat type with no fee row for the cabin is not one the seat map offers there.
  private async lookupSeatFee(cabin: string, seatType: SeatType) {
    try {
      return await this.seatFees.lookup(cabin, seatType)
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnprocessableEntityException(
          pricingError(PricingErrorCode.SEAT_TYPE_UNKNOWN, `No seat fee for ${cabin} / ${seatType}`, { cabin, seat_type: seatType }),
        )
      }
      throw error
    }
  }

  private async checkDisplayCurrency(currency: string | undefined) {
    if (!currency) return
    try {
      await this.currencyRates.convert(0, currency)
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(pricingError(PricingErrorCode.CURRENCY_UNKNOWN, `No rate for display currency ${currency}`))
      }
      throw error
    }
  }

  // Display only: converted from the stored total, never saved or charged. The quote's own currency is the base currency.
  private async displayTotal(quote: { total_amount: unknown }, currency: string | undefined) {
    if (!currency) return undefined
    return { currency, total_amount: await this.currencyRates.convert(Number(quote.total_amount), currency) }
  }

  private async findQuote(id: string) {
    const quote = await this.db.fare_quote.findUnique({ where: { id }, include: WITH_LINES })
    if (!quote) {
      throw new NotFoundException(pricingError(PricingErrorCode.QUOTE_NOT_FOUND, `Fare quote ${id} not found`))
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
    if (flight.status === 'cancelled') {
      throw new ConflictException(pricingError(PricingErrorCode.FLIGHT_CANCELLED, 'This flight was cancelled', { status: flight.status }))
    }
    if (!BOOKABLE_STATUSES.includes(flight.status) || flight.dep_at <= now) {
      throw new ConflictException(
        pricingError(PricingErrorCode.FLIGHT_DEPARTED, 'This flight has already departed', { status: flight.status }),
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
    return new ServiceUnavailableException(
      pricingError(PricingErrorCode.UPSTREAM_UNAVAILABLE, 'Seat availability is not available right now'),
    )
  }
}
