import { Injectable, Logger } from '@nestjs/common'
import type { RefundRecord } from './refund.types'
import { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import { PaymentsRefundsService } from './payments-refunds.service'

/** What Feature 17 tells Feature 5 when money has to go back for a cargo booking. */
export interface CargoRefundRequest {
  cargoBookingId: string
  /** `cargo_cancel` (the shipper cancels), `cargo_rejected` (staff reject the shipment) or `cargo_reweigh` (a lower weight). */
  reason: 'cargo_cancel' | 'cargo_rejected' | 'cargo_reweigh' | 'flight_cancelled'
  /** What goes back, worked out by Feature 17 from its fee and refundable percent (the whole payment before acceptance). */
  amount: number
  note: string
  /** Which re-weigh this is, so two of them on one booking are two refunds. */
  reweighNo?: number
}

/**
 * Feature 17's way to give money back, in process (there is no HTTP hop between features). 5a and 5b never price cargo:
 * 17 says how much, and this makes the one refund, once per source key.
 *
 * - A payment that is only **authorised** (capture stalled, so no Air Waybill) is voided: nothing was charged, nothing is
 *   refunded.
 * - A **captured** payment is refunded to the card, and the credit note and journal row follow.
 * - A cargo booking with no payment answers `undefined`: there is nothing to give back.
 *
 * A cancelled flight does not call this by itself: 17 marks the booking `rebook_required` and asks only when it cancels.
 */
@Injectable()
export class CargoRefundAdapter {
  private readonly logger = new Logger(CargoRefundAdapter.name)

  constructor(
    private readonly payments: PaymentsCheckoutService,
    private readonly refunds: PaymentsRefundsService,
  ) {}

  /**
   * The call Feature 17's cancel, reject and flight-cancel paths make, which know the payment but not the cargo booking id.
   * The whole `amount` goes back; a payment that is only authorised is voided instead (answers undefined).
   */
  async refundForPayment(request: {
    bookingRef: string
    paymentId: string
    amount: number
    reason: 'cancel' | 'rejected' | 'flight'
  }): Promise<RefundRecord | undefined> {
    const payment = await this.payments.findPaymentById(request.paymentId)
    if (!payment?.cargo_booking_id) throw new Error(`Payment ${request.paymentId} is not a cargo payment`)
    return this.refund({
      cargoBookingId: payment.cargo_booking_id,
      reason: { cancel: 'cargo_cancel', rejected: 'cargo_rejected', flight: 'flight_cancelled' }[
        request.reason
      ] as CargoRefundRequest['reason'],
      amount: request.amount,
      note: `Cargo booking ${request.bookingRef}`,
    })
  }

  async refund(request: CargoRefundRequest): Promise<RefundRecord | undefined> {
    const payment = await this.payments.findLivePaymentForCargoBooking(request.cargoBookingId)
    if (!payment) {
      this.logger.warn(`Cargo booking ${request.cargoBookingId} asked for a ${request.reason} refund, but 5a has no live payment for it`)
      return undefined
    }
    if (payment.status === 'authorised') {
      await this.payments.voidPayment(payment.id, request.reason)
      return undefined
    }
    return this.refunds.refundCargoBooking({
      paymentId: payment.id,
      cargoBookingId: request.cargoBookingId,
      reason: request.reason,
      amount: request.amount,
      note: request.note,
      reweighNo: request.reweighNo,
    })
  }
}
