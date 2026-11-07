import { Injectable } from '@nestjs/common'
import type { CancelQuote, FareQuote, FareQuoteRequest, PricingPort } from '../contracts'

const ECONOMY_FARE = 148.5
const CANCEL_FEE = 100

@Injectable()
export class PricingStub implements PricingPort {
  quote(request: FareQuoteRequest): Promise<FareQuote> {
    return Promise.resolve({
      currency: 'USD',
      total: ECONOMY_FARE,
      lines: [{ kind: 'fare', label: `${request.fareClassCode ?? 'Y'} fare`, amount: ECONOMY_FARE }],
    })
  }

  cancelQuote(): Promise<CancelQuote> {
    return Promise.resolve({ currency: 'USD', fee: CANCEL_FEE, refund: 0 })
  }

  seatFee(): Promise<number> {
    return Promise.resolve(0)
  }
}
