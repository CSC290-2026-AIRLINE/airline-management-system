import { Inject, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { fromCents, toCents } from '../money'
import { canMove, type PaymentStatus } from '../payment-state'
import { PAYMENT_PROVIDER, type PaymentProvider } from '../providers/payment-provider'
import { BOOKING_SELLER, CARGO_SELLER, type BookingSeller, type CargoSeller, type PurchaseSeller } from '../sellers/seller'
import { VoucherService } from './voucher.service'
import {
  FinancePostingService,
  PaymentMessagesService,
  PaymentSettingsService,
  ReceiptService,
  lockPayment,
  type Tx,
} from './support.services'

type PaymentRow = NonNullable<Awaited<ReturnType<DbService['payment']['findUnique']>>>

export interface AuthorisedInfo {
  sessionId?: string | null
  intentId?: string | null
  cardBrand?: string | null
  cardLast4?: string | null
}

/**
 * The payment state machine. Every status change goes through `move()`, inside a transaction that holds the payment's
 * row lock, and only moves forward (payment-state.ts). Triggers are verified webhooks, the seller's answers and jobs —
 * never a client response. Calls to the seller and the provider happen outside the lock, then the result is applied
 * under it, re-checking the status so a race (hold expiry vs. a late authorisation) cannot apply twice.
 */
@Injectable()
export class PaymentEngineService {
  private readonly logger = new Logger(PaymentEngineService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(BOOKING_SELLER) private readonly bookingSeller: BookingSeller,
    @Inject(CARGO_SELLER) private readonly cargoSeller: CargoSeller,
    private readonly settings: PaymentSettingsService,
    private readonly vouchers: VoucherService,
    private readonly receipts: ReceiptService,
    private readonly postings: FinancePostingService,
    private readonly messages: PaymentMessagesService,
  ) {}

  sellerFor(sourceFeature: number): PurchaseSeller {
    if (sourceFeature === 3) return this.bookingSeller
    if (sourceFeature === 17) return this.cargoSeller
    throw new Error(`No seller is registered for feature ${sourceFeature}`)
  }

  /** The one state-change function. Returns false (and changes nothing) when the move is not allowed from here. */
  async move(tx: Tx, payment: Pick<PaymentRow, 'id' | 'status'>, to: PaymentStatus, data: Record<string, unknown> = {}) {
    if (!canMove(payment.status, to)) return false
    const result = await tx.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: { ...data, status: to, updated_at: new Date() },
    })
    return result.count === 1
  }

  /** Locks and re-reads a payment inside a transaction. */
  async locked(tx: Tx, paymentId: string) {
    await lockPayment(tx, paymentId)
    return tx.payment.findUnique({ where: { id: paymentId } })
  }

  // ----- authorise ------------------------------------------------------------------------------------------------

  /**
   * Stripe authorised the card (payment_intent.amount_capturable_updated). Moves the attempt and the payment to
   * authorised, then asks the seller to confirm. A late authorisation for a payment that already ended is cancelled at
   * the provider, so the hold on the card is released and nothing is charged.
   */
  async onAuthorised(paymentId: string, info: AuthorisedInfo): Promise<void> {
    const outcome = await this.db.$transaction(async (tx) => {
      const payment = await this.locked(tx, paymentId)
      if (!payment) return 'unknown' as const
      const attempt = await this.findAttempt(tx, paymentId, info)
      if (payment.status !== 'created') {
        return payment.status === 'authorised' || payment.status === 'captured' ? ('repeat' as const) : ('late' as const)
      }
      if (attempt) {
        await tx.payment_attempt.update({
          where: { id: attempt.id },
          data: {
            status: 'authorised',
            provider_intent_id: info.intentId ?? attempt.provider_intent_id,
            card_brand: info.cardBrand ?? null,
            card_last4: info.cardLast4 && /^\d{4}$/.test(info.cardLast4) ? info.cardLast4 : null,
            failure_code: null,
            updated_at: new Date(),
          },
        })
      }
      await this.move(tx, payment, 'authorised', { authorised_at: this.clock.now() })
      return 'authorised' as const
    })

    if (outcome === 'late' && info.intentId) {
      this.logger.warn(`Authorisation arrived for a payment that already ended; cancelling it at the provider`)
      await this.provider.cancel(info.intentId)
      return
    }
    if (outcome === 'authorised') await this.confirmAndCapture(paymentId)
  }

  /** Step 4 and 5: ask the seller, then capture on a yes or void on a refusal. Safe to call again. */
  async confirmAndCapture(paymentId: string): Promise<void> {
    const payment = await this.db.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status !== 'authorised') return
    const answer = await this.sellerFor(payment.source_feature).confirm(payment.purchase_ref, payment.id)
    if (!answer.ok) {
      await this.voidPayment(paymentId, `${answer.code}: ${answer.message}`)
      return
    }
    await this.capture(paymentId)
  }

  // ----- capture --------------------------------------------------------------------------------------------------

  /**
   * Captures card_amount. On failure the payment stays authorised and capture_attempts counts up; after
   * capture_retry_limit it gets capture_stalled_at and shows on the staff exception list.
   */
  async capture(paymentId: string): Promise<{ ok: boolean; error?: string }> {
    const payment = await this.db.payment.findUnique({ where: { id: paymentId } })
    if (!payment) return { ok: false, error: 'Payment not found' }
    if (payment.status === 'captured' || payment.status === 'reversed') return { ok: true }
    if (payment.status !== 'authorised') return { ok: false, error: `Payment is ${payment.status}` }

    let feeCents: number | null = null
    if (payment.provider !== 'none') {
      const attempt = await this.db.payment_attempt.findFirst({ where: { payment_id: paymentId, status: 'authorised' } })
      const intentId = attempt?.provider_intent_id
      const result = intentId
        ? await this.provider.capture(intentId, toCents(payment.card_amount), payment.currency)
        : { ok: false as const, error: 'No authorised attempt to capture' }
      if (!result.ok) {
        await this.recordCaptureFailure(paymentId, result.error)
        return { ok: false, error: result.error }
      }
      feeCents = result.feeCents
    }

    const captured = await this.db.$transaction(async (tx) => this.markCaptured(tx, paymentId, feeCents))
    if (captured) await this.afterCaptured(paymentId)
    return { ok: true }
  }

  private async recordCaptureFailure(paymentId: string, error: string) {
    const limit = await this.settings.get('capture_retry_limit')
    await this.db.$transaction(async (tx) => {
      const payment = await this.locked(tx, paymentId)
      if (!payment || payment.status !== 'authorised') return
      const attempts = payment.capture_attempts + 1
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          capture_attempts: attempts,
          last_error: error.slice(0, 500),
          ...(attempts >= limit && !payment.capture_stalled_at && { capture_stalled_at: this.clock.now() }),
          updated_at: new Date(),
        },
      })
    })
    this.logger.warn(`Capture failed for payment ${paymentId}`)
  }

  /**
   * authorised -> captured (or created -> captured for a zero-cash payment). Redeems the voucher, issues the receipt,
   * writes the finance postings and the payment message, all in this transaction. Returns false for a repeat.
   */
  async markCaptured(tx: Tx, paymentId: string, feeCents: number | null): Promise<boolean> {
    const payment = await this.locked(tx, paymentId)
    if (!payment) return false
    const now = this.clock.now()
    const zeroCash = toCents(payment.amount_total) === 0
    const moved = await this.move(tx, payment, 'captured', {
      captured_at: now,
      ...(payment.status === 'created' && { authorised_at: now }),
      provider_fee: feeCents === null ? null : fromCents(feeCents),
      capture_stalled_at: null,
      last_error: null,
    })
    if (!moved) return false

    if (payment.voucher_id) await this.vouchers.redeem(tx, payment.voucher_id, payment.id, toCents(payment.voucher_amount), now)

    const billingName = await this.billingName(tx, payment.payer_customer_id)
    const receipt = await this.receipts.issue(tx, {
      paymentId: payment.id,
      documentType: payment.source_feature === 17 ? 'invoice' : 'receipt',
      amountCents: toCents(payment.amount_total),
      billingName,
      issuedAt: now,
    })

    // A zero-cash award booking moved no money: no posting and no message.
    if (zeroCash) return true

    const lines = await tx.payment_line.findMany({ where: { payment_id: payment.id }, select: { line_type: true, amount: true } })
    await this.postings.post(tx, {
      postingKey: `payment_captured:${payment.id}`,
      postingType: 'payment_captured',
      sourceType: 'payment',
      sourceId: payment.id,
      currency: payment.currency,
      occurredAt: now,
      payload: {
        lines: lines.map((l) => ({ category: l.line_type, amount: fromCents(toCents(l.amount)) })),
        voucher_amount: fromCents(toCents(payment.voucher_amount)),
        card_amount: fromCents(toCents(payment.card_amount)),
        source_feature: payment.source_feature,
        purchase_ref: payment.purchase_ref,
      },
    })
    if (feeCents && feeCents > 0) {
      await this.postings.post(tx, {
        postingKey: `payment_provider_fee:${payment.id}`,
        postingType: 'payment_provider_fee',
        sourceType: 'payment',
        sourceId: payment.id,
        currency: payment.currency,
        occurredAt: now,
        payload: { lines: [{ category: 'provider_fee', amount: fromCents(feeCents) }], provider: payment.provider },
      })
    }
    if (payment.payer_customer_id) {
      await this.messages.send(tx, 'payment_received', payment.id, {
        customer_id: payment.payer_customer_id,
        payment_id: payment.id,
        reference: payment.purchase_ref,
        amount: fromCents(toCents(payment.amount_total)),
        currency: payment.currency,
        document_number: receipt.document_number,
      })
    }
    return true
  }

  /** Published after the transaction commits; the seller must handle a repeat. */
  private async afterCaptured(paymentId: string) {
    const payment = await this.db.payment.findUnique({ where: { id: paymentId }, select: { source_feature: true, purchase_ref: true } })
    if (!payment) return
    try {
      await this.sellerFor(payment.source_feature).onCaptured(payment.purchase_ref, paymentId)
    } catch (error) {
      this.logger.error(`Seller onCaptured failed for ${paymentId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // ----- payments that never touch the card -----------------------------------------------------------------------

  /**
   * Voucher-only (card_amount 0) and zero-cash award payments skip the provider. A voucher-only payment is authorised
   * at once and then follows the normal confirm and capture. A zero-cash payment is confirmed and then recorded as
   * captured with authorised_at = captured_at.
   */
  async completeWithoutProvider(paymentId: string): Promise<void> {
    const payment = await this.db.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status !== 'created' || payment.provider !== 'none') return

    if (toCents(payment.amount_total) === 0) {
      const answer = await this.sellerFor(payment.source_feature).confirm(payment.purchase_ref, payment.id)
      if (!answer.ok) {
        await this.endUnpaid(paymentId, 'failed', `${answer.code}: ${answer.message}`)
        return
      }
      const captured = await this.db.$transaction((tx) => this.markCaptured(tx, paymentId, null))
      if (captured) await this.afterCaptured(paymentId)
      return
    }

    await this.db.$transaction(async (tx) => {
      const locked = await this.locked(tx, paymentId)
      if (locked) await this.move(tx, locked, 'authorised', { authorised_at: this.clock.now() })
    })
    await this.confirmAndCapture(paymentId)
  }

  // ----- void, fail, expire ---------------------------------------------------------------------------------------

  /**
   * authorised -> voided: the seller refused, or 3b cancels a booking whose capture stalled (voidPayment). Nothing was
   * captured, so no refund is needed. The voucher is free again because the payment is no longer live.
   */
  async voidPayment(paymentId: string, reason: string): Promise<boolean> {
    const payment = await this.db.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status !== 'authorised') return payment?.status === 'voided'
    const attempt = await this.db.payment_attempt.findFirst({ where: { payment_id: paymentId, status: 'authorised' } })
    if (payment.provider !== 'none' && attempt?.provider_intent_id) await this.provider.cancel(attempt.provider_intent_id)

    return this.db.$transaction(async (tx) => {
      const locked = await this.locked(tx, paymentId)
      if (!locked) return false
      const moved = await this.move(tx, locked, 'voided', {
        voided_at: this.clock.now(),
        capture_stalled_at: null,
        last_error: reason.slice(0, 500),
      })
      if (moved) {
        await tx.payment_attempt.updateMany({
          where: { payment_id: paymentId, status: { in: ['open', 'authorised'] } },
          data: { status: 'cancelled', updated_at: new Date() },
        })
      }
      return moved
    })
  }

  /**
   * created -> failed or expired. Closes any open session first; if the provider says the customer already paid, the
   * payment is left alone so the webhook takes the normal late path. Then asks the seller to release its hold early.
   */
  async endUnpaid(paymentId: string, to: 'failed' | 'expired', reason: string): Promise<boolean> {
    const open = await this.db.payment_attempt.findMany({ where: { payment_id: paymentId, status: 'open' } })
    for (const attempt of open) {
      if ((await this.provider.expireSession(attempt.provider_session_id)) === 'complete') return false
    }

    const moved = await this.db.$transaction(async (tx) => {
      const payment = await this.locked(tx, paymentId)
      if (!payment) return null
      const ok = await this.move(tx, payment, to, { last_error: reason.slice(0, 500) })
      if (ok) {
        await tx.payment_attempt.updateMany({
          where: { payment_id: paymentId, status: 'open' },
          data: { status: 'expired', updated_at: new Date() },
        })
      }
      return ok ? payment : null
    })
    if (!moved) return false
    try {
      await this.sellerFor(moved.source_feature).release(moved.purchase_ref)
    } catch (error) {
      this.logger.warn(`Seller release failed for ${paymentId}: ${error instanceof Error ? error.message : String(error)}`)
    }
    return true
  }

  private async findAttempt(tx: Tx, paymentId: string, info: AuthorisedInfo) {
    if (info.sessionId) {
      const bySession = await tx.payment_attempt.findUnique({ where: { provider_session_id: info.sessionId } })
      if (bySession) return bySession
    }
    if (info.intentId) {
      const byIntent = await tx.payment_attempt.findUnique({ where: { provider_intent_id: info.intentId } })
      if (byIntent) return byIntent
    }
    return tx.payment_attempt.findFirst({ where: { payment_id: paymentId, status: 'open' }, orderBy: { created_at: 'desc' } })
  }

  private async billingName(tx: Tx, customerId: string | null): Promise<string | null> {
    if (!customerId) return null
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { passenger: { select: { first_name: true, last_name: true } } },
    })
    return customer ? `${customer.passenger.first_name} ${customer.passenger.last_name}` : null
  }
}
