import { HttpException, Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FareQuoteService } from '@backend/modules/pricing/fare-quote/fare-quote.service'
import { PromoCodeService } from '@backend/modules/pricing/promo-code/promo-code.service'
import { SeatFeeService } from '@backend/modules/pricing/seat-fee/seat-fee.service'
import { BookingError, type BookingErrorCode } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  type BookingClock,
  type CancelQuote,
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
      const fee = await this.seatFees.lookup(request.cabin, request.seatType)
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

  // Not written yet: Feature 4's cancellation fee lives on the quote's snapshot and needs the booking's coupons.
  cancelQuote(): Promise<CancelQuote> {
    return Promise.reject(new Error('cancelQuote not implemented yet'))
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
