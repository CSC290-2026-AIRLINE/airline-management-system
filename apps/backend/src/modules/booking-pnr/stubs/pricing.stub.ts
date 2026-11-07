import { Injectable } from '@nestjs/common'
import type { CancelQuote, FareQuote, FareQuoteRequest, PricingPort } from '../contracts'

const ECONOMY_FARE = 148.5
const CANCEL_FEE = 100

// Stub until Feature 4 (PR #35) lands: a fixed fare per passenger and a flat cancel fee.
// fareQuoteId is null because no fare_quote row exists; booking_coupon.fare_quote_id stays null with this stub.
@Injectable()
export class PricingStub implements PricingPort {
  quote(request: FareQuoteRequest): Promise<FareQuote> {
    return Promise.resolve({
      fareQuoteId: null,
      fareClassId: request.fareClassId,
      currency: 'USD',
      pricePerPassenger: ECONOMY_FARE,
      fareRuleSnapshot: { cancelFeeFlat: CANCEL_FEE, refundable: true },
      lines: [{ kind: 'fare', label: 'Fare', amount: ECONOMY_FARE }],
    })
  }

  cancelQuote(): Promise<CancelQuote> {
    return Promise.resolve({ currency: 'USD', fee: CANCEL_FEE, refund: 0 })
  }

  seatFee(): Promise<number> {
    return Promise.resolve(0)
  }

  redeem(): Promise<void> {
    return Promise.resolve()
  }
}
