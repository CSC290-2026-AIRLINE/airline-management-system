import { Injectable, Logger } from '@nestjs/common'
import { PaymentEventsService } from '@backend/modules/onboard-products/payment-events/payment-events.service'
import { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import type { PaymentRecord } from '@backend/modules/payments-checkout/payment.types'

const PREFIX = 'product_order:'

/** Feature 12's answer for a status it cannot act on: the order is gone, or it is not in a state that can be paid. */
function refused(error: unknown): boolean {
  const status = (error as { status?: unknown; getStatus?: () => number })?.status ?? (error as { getStatus?: () => number })?.getStatus?.()
  return status === 404 || status === 409 || status === 422
}

/**
 * The seller's side of an onboard order (source feature 12). Feature 12 owns the order and its stock; Feature 5 owns the
 * money. They talk in process, through F12's `PaymentEventsService`, which is the same call Feature 5 was meant to make
 * over HTTP:
 *
 * - **Confirm.** Once the card is authorised, the order is confirmed (`paid`). A yes captures the card. If the order is not
 *   payable any more (it expired, or was cancelled), F12 refuses and 5a voids the authorisation: nothing was charged.
 * - **Release.** A payment that expired unpaid tells F12 (`failed`), which expires the order and gives the stock back.
 */
@Injectable()
export class OnboardSellerService {
  private readonly logger = new Logger(OnboardSellerService.name)

  constructor(
    private readonly payments: PaymentsCheckoutService,
    private readonly events: PaymentEventsService,
  ) {
    this.payments.registerSellerConfirmation(12, (payment) => this.confirm(payment))
    this.payments.registerSellerRelease(12, (payment) => this.release(payment))
  }

  private orderOf(payment: PaymentRecord): string | null {
    return payment.purchase_ref.startsWith(PREFIX) ? payment.purchase_ref.slice(PREFIX.length) : null
  }

  async confirm(payment: PaymentRecord): Promise<boolean> {
    const reference = this.orderOf(payment)
    // A payment that is not an order (an on-board sale is already captured) has nothing for the seller to confirm.
    if (!reference) return true
    try {
      const result = await this.events.handle({ reference, paymentId: payment.id, status: 'paid' })
      return result.status === 'confirmed' && !result.refunded
    } catch (error) {
      if (refused(error)) {
        this.logger.warn(`Order ${reference} was not confirmed; the authorisation is voided`)
        return false
      }
      throw error
    }
  }

  async release(payment: PaymentRecord): Promise<void> {
    const reference = this.orderOf(payment)
    if (!reference) return
    try {
      await this.events.handle({ reference, paymentId: payment.id, status: 'failed' })
    } catch (error) {
      if (!refused(error)) throw error
    }
  }
}
