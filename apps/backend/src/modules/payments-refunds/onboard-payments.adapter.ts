import { Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { PaymentRequest, PaymentsPort, PaymentStartResult } from '@backend/modules/onboard-products/common/cross-module-ports'
import { messageAmount, queueCustomerMessage, receiptNumberOf } from '@backend/modules/payments-checkout/customer-messages'
import { capturedPostings, writePostings } from '@backend/modules/payments-checkout/finance-journal'
import { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import { PaymentsRefundsService } from './payments-refunds.service'

/** How long a customer has to pay an onboard order before the payment is left to expire. */
const ORDER_PAYMENT_MINUTES = 60

/**
 * Feature 5's answer to Feature 12's `PaymentsPort`. It replaces F12's `StubPaymentsService`, which wrote payment rows
 * itself.
 *
 * - **A pre-order** (`startPayment`) is a real 5a payment for source 12 with one `onboard_order` line, in `created`. The
 *   customer pays it like any other: `POST /checkout` with its `payment_id`, then the card is authorised, F12's order is
 *   confirmed through `PaymentEventsService` (see `OnboardSellerService`), and the card is captured.
 * - **A sale on board** (`collect`) has no customer and no booking and is paid on the spot, so it is recorded as a captured
 *   payment on the fake provider, with its line, receipt and journal row (the spec's proposal for source 12).
 * - **A cancelled order** (`refund`) voids a payment that was only authorised, closes one nobody paid, or refunds a captured
 *   one to the card.
 *
 * `settle` does nothing: Feature 5 moves a payment's state itself, from verified provider events and the seller's answers,
 * and never because another feature says so.
 */
@Injectable()
export class OnboardPaymentsAdapter implements PaymentsPort {
  private readonly logger = new Logger(OnboardPaymentsAdapter.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    private readonly payments: PaymentsCheckoutService,
    private readonly refunds: PaymentsRefundsService,
  ) {}

  async isPaymentConfirmed(paymentId: string): Promise<boolean> {
    const payment = await this.payments.findPaymentById(paymentId).catch(() => undefined)
    return payment?.status === 'captured' || payment?.status === 'reversed'
  }

  async startPayment(request: PaymentRequest): Promise<PaymentStartResult> {
    if (!request.customerId) return { paymentId: '', status: 'failed' }
    // A retry of the same checkout reuses the same payment (the idempotency key is the order reference).
    const key = `f12:${request.reference}`
    const existing = await this.payments.findPaymentByKey(request.customerId, key)
    if (existing) return { paymentId: existing.id, status: 'pending' }
    try {
      const now = this.clock.now()
      const payment = await this.payments.createPayment({
        source_feature: 12,
        purchase_ref: `product_order:${request.reference}`,
        payer_customer_id: request.customerId,
        idempotency_key: key,
        amount_total: request.amount,
        currency: request.currency,
        lines: [
          {
            line_type: 'onboard_order',
            description: 'Onboard order',
            amount: request.amount,
            source_ref: `product_order:${request.reference}`,
          },
        ],
        expires_at: new Date(now.getTime() + ORDER_PAYMENT_MINUTES * 60_000),
      })
      return { paymentId: payment.id, status: 'pending' }
    } catch (error) {
      this.logger.warn(`Order ${request.reference} could not start a payment: ${String(error)}`)
      return { paymentId: '', status: 'failed' }
    }
  }

  async collect(request: PaymentRequest): Promise<PaymentStartResult> {
    const key = `f12:${request.reference}`
    const now = this.clock.now()
    const paymentId = await this.db.$transaction(async (tx) => {
      const existing = await tx.payment.findFirst({ where: { payer_customer_id: request.customerId, idempotency_key: key } })
      if (existing) return existing.id
      const payment = await tx.payment.create({
        data: {
          source_feature: 12,
          purchase_ref: `sale:${request.reference}`,
          payer_customer_id: request.customerId,
          idempotency_key: key,
          provider: 'fake',
          status: 'captured',
          currency: request.currency,
          amount_total: request.amount,
          card_amount: request.amount,
          started_at: now,
          expires_at: new Date(now.getTime() + 300_000),
          authorised_at: now,
          captured_at: now,
          updated_at: now,
        },
        select: { id: true },
      })
      await tx.payment_line.create({
        data: {
          payment_id: payment.id,
          line_type: 'onboard_order',
          source_ref: `sale:${request.reference}`,
          description: 'Sale on board',
          amount: request.amount,
        },
      })
      await tx.receipt.create({
        data: {
          payment_id: payment.id,
          document_type: 'receipt',
          document_number: `RCPT-${payment.id.slice(-6).toUpperCase()}`,
          amount: request.amount,
          billing_name: null,
          issued_at: now,
        },
      })
      await writePostings(
        tx,
        capturedPostings({
          id: payment.id,
          currency: request.currency,
          provider: 'fake',
          amount_total: request.amount,
          voucher_amount: 0,
          voucher_id: null,
          provider_fee: null,
          captured_at: now,
          lines: [{ line_type: 'onboard_order', amount: request.amount }],
        }),
      )
      await queueCustomerMessage(tx, {
        type: 'payment_received',
        sourceId: payment.id,
        customerId: request.customerId,
        at: now,
        placeholders: {
          reference: request.reference,
          amount: messageAmount(request.amount, request.currency),
          document_number: receiptNumberOf({ id: payment.id, source_feature: 12 }),
        },
      })
      return payment.id
    })
    return { paymentId, status: 'paid' }
  }

  settle(): Promise<void> {
    return Promise.resolve()
  }

  async refund(paymentId: string, amount: number, reason: string): Promise<boolean> {
    try {
      const payment = await this.payments.findPaymentById(paymentId)
      if (!payment) return false
      if (payment.status === 'created') {
        await this.payments.cancelUnpaid(payment.id, reason)
        return true
      }
      if (payment.status === 'authorised') {
        await this.payments.voidPayment(payment.id, reason)
        return true
      }
      // Already refunded, or never charged (voided, failed, expired): a repeated cancel has nothing left to do.
      if (payment.status === 'reversed' || payment.status === 'voided' || payment.status === 'failed' || payment.status === 'expired')
        return true
      if (payment.status !== 'captured') return false
      await this.refunds.refundOnboardOrder({ paymentId: payment.id, amount, note: reason })
      return true
    } catch (error) {
      this.logger.error(`Refund of payment ${paymentId} failed: ${String(error)}`)
      return false
    }
  }
}
