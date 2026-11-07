import { Injectable } from '@nestjs/common'
import type { ChargeRequest, CheckoutPort, PaymentResult } from '../contracts'

@Injectable()
export class CheckoutStub implements CheckoutPort {
  charge(request: ChargeRequest): Promise<PaymentResult> {
    return Promise.resolve({
      paymentId: `stub-${request.bookingId}`,
      amount: request.amount,
      currency: request.currency,
    })
  }
}
