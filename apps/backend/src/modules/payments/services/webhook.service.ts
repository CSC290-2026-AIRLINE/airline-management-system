import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { FakePaymentProvider } from '../providers/fake.provider'
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderEvent } from '../providers/payment-provider'
import { PaymentEngineService } from './payment-engine.service'
import { RefundService } from './refund.service'
import { lockPayment } from './support.services'

/** The events that drive a payment or refund. Any other verified event is stored and ignored. */
export const HANDLED_EVENTS = [
  'payment_intent.amount_capturable_updated',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'checkout.session.expired',
  'refund.created',
  'refund.updated',
  'refund.failed',
] as const

/**
 * Applies provider events. The receipt (payment_event_receipt) is written first, then the event is applied, then
 * processed_at is set. A repeat is skipped only when processed_at is set; a receipt left with processed_at empty (the
 * app stopped in between) is applied again by the reconcile job, so an event is never lost.
 */
@Injectable()
export class WebhookService implements OnModuleInit {
  private readonly logger = new Logger(WebhookService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly engine: PaymentEngineService,
    private readonly refunds: RefundService,
  ) {}

  onModuleInit() {
    // Fake events take exactly the path verified Stripe events take.
    if (this.provider instanceof FakePaymentProvider)
      this.provider.onEvent(async (event) => {
        await this.ingest(event)
      })
  }

  async ingest(event: ProviderEvent): Promise<'applied' | 'repeat' | 'ignored'> {
    const paymentId = await this.resolvePaymentId(event)
    await this.db.payment_event_receipt.createMany({
      data: [{ provider_event_id: event.id, event_type: event.type, payment_id: paymentId }],
      skipDuplicates: true,
    })
    const receipt = await this.db.payment_event_receipt.findUniqueOrThrow({ where: { provider_event_id: event.id } })
    if (receipt.processed_at) return 'repeat'

    const handled = (HANDLED_EVENTS as readonly string[]).includes(event.type)
    if (handled) await this.apply({ ...event, paymentId })
    await this.db.payment_event_receipt.updateMany({
      where: { provider_event_id: event.id, processed_at: null },
      data: { processed_at: this.clock.now() },
    })
    return handled ? 'applied' : 'ignored'
  }

  private async apply(event: ProviderEvent): Promise<void> {
    const paymentId = event.paymentId
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated':
        if (paymentId) await this.engine.onAuthorised(paymentId, event)
        return
      case 'payment_intent.succeeded':
        // Our own capture call already applied it; this covers a capture whose response was lost.
        if (paymentId) await this.db.$transaction((tx) => this.engine.markCaptured(tx, paymentId, event.feeCents ?? null))
        return
      case 'payment_intent.payment_failed':
        // The payment stays created so the customer can try again on the same hosted page.
        await this.db.payment_attempt.updateMany({
          where: {
            status: 'open',
            OR: [
              ...(event.sessionId ? [{ provider_session_id: event.sessionId }] : []),
              ...(event.intentId ? [{ provider_intent_id: event.intentId }] : []),
              ...(paymentId ? [{ payment_id: paymentId }] : []),
            ],
          },
          data: { failure_code: (event.failureCode ?? 'declined').slice(0, 100), updated_at: new Date() },
        })
        return
      case 'payment_intent.canceled':
        if (paymentId) await this.engine.voidPayment(paymentId, 'Cancelled at the provider')
        return
      case 'checkout.session.expired':
        if (paymentId) await this.onSessionExpired(paymentId, event.sessionId ?? null)
        return
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed':
        await this.refunds.applyProviderEvent(event)
        return
      default:
        return
    }
  }

  /** The attempt closes; with no other open attempt the payment fails (or expires, once its hold has ended). */
  private async onSessionExpired(paymentId: string, sessionId: string | null) {
    const stillOpen = await this.db.$transaction(async (tx) => {
      await lockPayment(tx, paymentId)
      if (sessionId) {
        await tx.payment_attempt.updateMany({
          where: { provider_session_id: sessionId, status: 'open' },
          data: { status: 'expired', updated_at: new Date() },
        })
      }
      return tx.payment_attempt.count({ where: { payment_id: paymentId, status: 'open' } })
    })
    if (stillOpen > 0) return
    const payment = await this.db.payment.findUnique({ where: { id: paymentId } })
    if (payment?.status !== 'created') return
    const ended = payment.expires_at <= this.clock.now()
    await this.engine.endUnpaid(paymentId, ended ? 'expired' : 'failed', 'The hosted payment page expired')
  }

  private async resolvePaymentId(event: ProviderEvent): Promise<string | null> {
    if (event.paymentId) {
      const exists = await this.db.payment.findUnique({ where: { id: event.paymentId }, select: { id: true } })
      if (exists) return exists.id
    }
    if (event.sessionId || event.intentId) {
      const attempt = await this.db.payment_attempt.findFirst({
        where: {
          OR: [
            ...(event.sessionId ? [{ provider_session_id: event.sessionId }] : []),
            ...(event.intentId ? [{ provider_intent_id: event.intentId }] : []),
          ],
        },
        select: { payment_id: true },
      })
      if (attempt) return attempt.payment_id
    }
    if (event.refundId || event.providerRefundId) {
      const refund = await this.db.refund.findFirst({
        where: {
          OR: [
            ...(event.refundId ? [{ id: event.refundId }] : []),
            ...(event.providerRefundId ? [{ provider_refund_id: event.providerRefundId }] : []),
          ],
        },
        select: { payment_id: true },
      })
      if (refund) return refund.payment_id
    }
    this.logger.warn(`Provider event ${event.type} matched no payment; stored and ignored`)
    return null
  }

  /** Receipts written but never applied (problem 36), older than 30 seconds, re-read from the provider and applied. */
  async applyUnprocessed(): Promise<number> {
    const stale = await this.db.payment_event_receipt.findMany({
      where: { processed_at: null, received_at: { lt: new Date(Date.now() - 30_000) } },
      orderBy: { received_at: 'asc' },
      take: 50,
    })
    let applied = 0
    for (const receipt of stale) {
      const event = await this.provider.retrieveEvent(receipt.provider_event_id).catch(() => null)
      if (!event) continue
      await this.apply({ ...event, paymentId: event.paymentId ?? receipt.payment_id })
      await this.db.payment_event_receipt.update({
        where: { provider_event_id: receipt.provider_event_id },
        data: { processed_at: this.clock.now() },
      })
      applied++
    }
    return applied
  }
}
