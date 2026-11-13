import { HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FareQuoteService } from '@backend/modules/pricing/fare-quote/fare-quote.service'
import { PromoCodeService } from '@backend/modules/pricing/promo-code/promo-code.service'
import { SeatFeeService } from '@backend/modules/pricing/seat-fee/seat-fee.service'
import { BookingError, type BookingErrorCode } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  type BookingClock,
  type CancelQuote,
  type CancelQuoteRequest,
  type FareQuote,
  type FareQuoteRequest,
  type PricingPort,
  type SeatFeeRequest,
} from '../contracts'

// A line of Feature 4's quote: the kind of charge, the label shown to the customer and the amount.
interface QuoteLineRow {
  kind: string
  label: string
  amount: unknown
}

// Feature 4's quote row. The service renames the lines relation to `lines`; `fare_quote_line` is accepted as well.
interface QuoteRow {
  id: string
  fare_class_id: string
  currency: string
  total_amount: unknown
  fare_rule_snapshot: unknown
  lines?: QuoteLineRow[]
  fare_quote_line?: QuoteLineRow[]
}

// Feature 4's cancellation fee for one quote: allowed says the fare is refundable, fee is null when it is not.
type QuoteFee = Awaited<ReturnType<FareQuoteService['fee']>>

// Feature 4's error codes that mean something specific to a booking.
const PRICING_ERROR_MAP: Record<string, { code: BookingErrorCode; status: number }> = {
  FARE_CLASS_UNAVAILABLE: { code: 'SEAT_UNAVAILABLE', status: 409 },
  FLIGHT_CANCELLED: { code: 'FLIGHT_NOT_FOR_SALE', status: 409 },
  FLIGHT_DEPARTED: { code: 'FLIGHT_NOT_FOR_SALE', status: 409 },
  QUOTE_EXPIRED: { code: 'BOOKING_CLOSED', status: 409 },
  SEAT_TYPE_UNKNOWN: { code: 'SEAT_NOT_ALLOWED', status: 422 },
}

// The code used when Feature 4 answers with an error that carries no pricing code of its own.
const UNKNOWN_PRICING_CODE = 'PRICING_ERROR'

// Feature 3's seat layout names a seat 'standard' or 'exit'; Feature 4 prices 'normal' and 'exit_row'. The two
// vocabularies meet here, so the seat map can ask for the fee of a seat it drew.
const PRICING_SEAT_TYPES: Record<string, string> = {
  standard: 'normal',
  exit: 'exit_row',
  extra_legroom: 'extra_legroom',
}

@Injectable()
export class PricingAdapter implements PricingPort {
  constructor(
    private readonly fareQuotes: FareQuoteService,
    private readonly seatFees: SeatFeeService,
    private readonly promoCodes: PromoCodeService,
    private readonly db: DbService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  // Feature 4 prices one passenger for one flight, cabin and fare class, so its total is the price per passenger.
  async quote(request: FareQuoteRequest): Promise<FareQuote> {
    try {
      const quote = (await this.fareQuotes.create({
        flight_id: request.flightId,
        fare_class_id: request.fareClassId,
        seat_type: request.seatType,
        promo_code: request.promoCode,
      })) as unknown as QuoteRow
      const rows = quote.lines ?? quote.fare_quote_line ?? []
      return {
        fareQuoteId: quote.id,
        fareClassId: quote.fare_class_id ?? request.fareClassId,
        currency: quote.currency,
        pricePerPassenger: Number(quote.total_amount),
        fareRuleSnapshot: (quote.fare_rule_snapshot ?? null) as Record<string, unknown> | null,
        lines: rows.map((line) => ({ kind: line.kind, label: line.label, amount: Number(line.amount) })),
      }
    } catch (error) {
      throw this.translate(error)
    }
  }

  async seatFee(request: SeatFeeRequest): Promise<number> {
    try {
      const seatType = PRICING_SEAT_TYPES[request.seatType] ?? request.seatType
      const fee = await this.seatFees.lookup(request.cabin, seatType)
      return Number(fee.amount)
    } catch (error) {
      throw this.translate(error)
    }
  }

  // Counts one use of the promo code per booking. The code is checked first, so an unknown or used-up code is
  // refused before anything is written.
  async redeem(promoCode: string, fareQuoteId: string, bookingRef: string): Promise<void> {
    try {
      const promo = await this.promoCodes.checkPromo(promoCode, this.clock.now())
      await this.promoCodes.redeem(promo.id, { booking_ref: bookingRef, fare_quote_id: fareQuoteId })
    } catch (error) {
      throw this.translate(error)
    }
  }

  // The cancellation fee and the refund of a booking, priced from Feature 4's quote snapshots (B6). Every coupon of
  // the booking carries its own price and the quote it was sold under; a coupon without a quote (a lap infant, or a
  // booking sold before the real adapter) cannot be refunded, so its whole price becomes the fee.
  async cancelQuote(request: CancelQuoteRequest): Promise<CancelQuote> {
    try {
      const where = {
        booking_id: request.bookingId,
        status: 'confirmed',
        ...(request.couponIds ? { id: { in: request.couponIds } } : {}),
      }
      const [coupons, booking] = await Promise.all([
        this.db.booking_coupon.findMany({ where, select: { price_total: true, fare_quote_id: true } }),
        this.db.booking.findUnique({ where: { id: request.bookingId }, select: { currency: true } }),
      ])

      // One fee per quote: two coupons sold under the same quote ask Feature 4 once. A quote that is gone cannot be
      // refunded, so it is read as no fee at all and the coupon's whole price becomes the fee.
      const fees = new Map<string, Promise<QuoteFee | null>>()
      const quoteFee = (fareQuoteId: string): Promise<QuoteFee | null> => {
        const cached = fees.get(fareQuoteId)
        if (cached) return cached
        const pending = this.fareQuotes.fee(fareQuoteId, 'cancel').catch((error: unknown) => {
          if (error instanceof NotFoundException) return null
          throw error
        })
        fees.set(fareQuoteId, pending)
        return pending
      }

      let fee = 0
      let refund = 0
      let currency: string | null = null

      for (const coupon of coupons) {
        const priceTotal = Number(coupon.price_total)
        if (!coupon.fare_quote_id) {
          fee += priceTotal
          continue
        }

        const quote = await quoteFee(coupon.fare_quote_id)
        if (!quote) {
          fee += priceTotal
          continue
        }

        currency ??= quote.currency
        if (!quote.allowed) {
          fee += priceTotal
          continue
        }

        // The fee never exceeds what the coupon was paid for.
        const couponFee = Math.min(quote.fee ?? 0, priceTotal)
        fee += couponFee
        refund += priceTotal - couponFee
      }

      return { currency: currency ?? booking?.currency ?? 'USD', fee, refund }
    } catch (error) {
      throw this.translate(error)
    }
  }

  // A Feature 4 error becomes a Feature 3 error. The pricing code and its details travel in the booking error, so
  // nothing about the pricing answer is lost.
  private translate(error: unknown): unknown {
    if (error instanceof BookingError) return error
    if (!(error instanceof HttpException)) throw error

    const status = error.getStatus()
    const body = error.getResponse()
    const payload = (typeof body === 'object' && body !== null ? body : {}) as {
      error?: { code?: unknown; message?: unknown; details?: unknown }
    }
    const pricing = payload.error ?? {}
    const pricingCode = typeof pricing.code === 'string' ? pricing.code : UNKNOWN_PRICING_CODE
    const mapped = PRICING_ERROR_MAP[pricingCode]
    const message = typeof pricing.message === 'string' ? pricing.message : error.message
    const details: Record<string, unknown> = { pricingCode }
    if (pricing.details !== undefined) details.pricingDetails = pricing.details

    return new BookingError(mapped?.code ?? 'INVALID_BOOKING_STATE', message, mapped?.status ?? status, details)
  }
}
