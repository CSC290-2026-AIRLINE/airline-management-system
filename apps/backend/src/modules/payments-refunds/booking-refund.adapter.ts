import { Injectable, Logger } from '@nestjs/common'
import type { RefundPort, RefundRequest } from '@backend/modules/booking-pnr/contracts'
import { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import { PaymentsRefundsService } from './payments-refunds.service'

/**
 * Feature 5's answer to Feature 3's `RefundPort`: what 3 calls when a booking is cancelled (or a late payment cannot be
 * honoured). It replaces 3's `RefundStub`.
 *
 * - A payment that is only **authorised** (capture stalled, or confirm refused after a late authorisation) is voided, not
 *   refunded: nothing was charged, so there is nothing to give back.
 * - A **captured** payment gets one `customer_cancel` refund for `amount` (the fare less the cancellation fee 3 priced),
 *   once per booking.
 * - A booking with no payment in 5a has nothing to refund; that is logged, not an error, so a cancel never fails on it.
 *
 * It never throws: Feature 3 already logs and carries on when `record` fails, and a half-done cancel is worse than a
 * refund that staff can see is missing on the exception list.
 */
@Injectable()
export class BookingRefundAdapter implements RefundPort {
  private readonly logger = new Logger(BookingRefundAdapter.name)

  constructor(
    private readonly payments: PaymentsCheckoutService,
    private readonly refunds: PaymentsRefundsService,
  ) {}

  async record(request: RefundRequest): Promise<void> {
    try {
      const payment = await this.payments.findLivePaymentForBooking(request.bookingId)
      if (!payment) {
        this.logger.warn(`Booking ${request.bookingId} was cancelled with ${request.amount} to refund, but 5a has no live payment for it`)
        return
      }
      if (payment.status === 'authorised') {
        await this.payments.voidPayment(payment.id, request.reason)
        return
      }
      await this.refunds.refundCancelledBooking({
        paymentId: payment.id,
        bookingId: request.bookingId,
        amount: request.amount,
        reason: request.reason,
      })
    } catch (error) {
      this.logger.error(`Refund for cancelled booking ${request.bookingId} was not recorded: ${String(error)}`)
    }
  }
}
