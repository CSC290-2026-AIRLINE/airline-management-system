import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PAYMENT_PROVIDER, type PaymentProvider } from '../providers/payment-provider'
import { CrewPayService } from '../crew-pay/crew-pay.service'
import { PaymentEngineService } from './payment-engine.service'
import { RefundService } from './refund.service'
import { VoucherService } from './voucher.service'
import { WebhookService } from './webhook.service'

const JOB_INTERVAL_MS = 60_000
const RECONCILE_AFTER_MS = 2 * 60_000

/**
 * Feature 5's jobs, on a plain interval (no scheduler package is installed). Each pass:
 *   - hold end: created payments past expires_at (simulation clock) get their session expired and become expired;
 *   - capture: authorised payments whose capture failed are retried until capture_retry_limit, then stall;
 *   - reconcile (real clock): payments and refunds stuck for 2 minutes are re-read from the provider, and webhook
 *     receipts never applied are applied;
 *   - flight cancellations without a refund receipt are refunded, in seq order;
 *   - vouchers past expiry expire;
 *   - crew pay (5c): pairings whose last leg has arrived are priced into payroll lines.
 * Off under NODE_ENV=test. Every step is idempotent, so two backend instances only repeat each other's work.
 */
@Injectable()
export class PaymentJobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentJobsService.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly engine: PaymentEngineService,
    private readonly refunds: RefundService,
    private readonly vouchers: VoucherService,
    private readonly webhooks: WebhookService,
    private readonly crewPay: CrewPayService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return
    // Startup catch-up first, then every minute.
    setTimeout(() => void this.runOnce(), 5_000)
    this.timer = setInterval(() => void this.runOnce(), JOB_INTERVAL_MS)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runOnce(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.step('hold end', () => this.expireHolds())
      await this.step('capture retry', () => this.retryCaptures())
      await this.step('reconcile', () => this.reconcile())
      await this.step('webhook receipts', () => this.webhooks.applyUnprocessed())
      await this.step('flight cancellations', () => this.refunds.catchUpFlightCancellations())
      await this.step('voucher expiry', () => this.vouchers.expireDue())
      await this.step('crew pay pricing', () => this.crewPay.pricePendingPairings())
    } finally {
      this.running = false
    }
  }

  private async step(name: string, run: () => Promise<number>) {
    try {
      const count = await run()
      if (count > 0) this.logger.log(`${name}: ${count}`)
    } catch (error) {
      this.logger.error(`${name} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Problem 2 and 7: a hosted session outlives the hold, and a clock jump makes every open hold stale. */
  async expireHolds(): Promise<number> {
    const due = await this.db.payment.findMany({
      where: { status: 'created', expires_at: { lte: this.clock.now() } },
      select: { id: true },
      take: 100,
    })
    let count = 0
    for (const { id } of due) if (await this.engine.endUnpaid(id, 'expired', 'The hold ended before payment')) count++
    return count
  }

  async retryCaptures(): Promise<number> {
    const due = await this.db.payment.findMany({
      where: { status: 'authorised', capture_stalled_at: null, updated_at: { lt: new Date(Date.now() - 30_000) } },
      select: { id: true, capture_attempts: true },
      take: 50,
    })
    for (const payment of due) {
      // Never captured yet: the confirm step itself was interrupted, so run it again; otherwise retry the capture.
      if (payment.capture_attempts === 0) await this.engine.confirmAndCapture(payment.id)
      else await this.engine.capture(payment.id)
    }
    return due.length
  }

  /** Problem 6: lost webhooks. Re-reads stuck payments and refunds from the provider and applies what it finds. */
  async reconcile(): Promise<number> {
    const before = new Date(Date.now() - RECONCILE_AFTER_MS)
    const attempts = await this.db.payment_attempt.findMany({
      where: { status: 'open', payment: { status: 'created', updated_at: { lt: before } } },
      take: 50,
    })
    let fixed = 0
    for (const attempt of attempts) {
      const session = await this.provider.lookupSession(attempt.provider_session_id).catch(() => null)
      if (!session) continue
      if (session.intentStatus === 'requires_capture' || session.intentStatus === 'succeeded') {
        await this.engine.onAuthorised(attempt.payment_id, {
          sessionId: attempt.provider_session_id,
          intentId: session.intentId,
          cardBrand: session.cardBrand,
          cardLast4: session.cardLast4,
        })
        fixed++
      } else if (session.state === 'expired') {
        await this.webhooks.ingest({
          id: `reconcile:${attempt.provider_session_id}:expired`,
          type: 'checkout.session.expired',
          paymentId: attempt.payment_id,
          sessionId: attempt.provider_session_id,
        })
        fixed++
      }
    }

    const refunds = await this.db.refund.findMany({ where: { status: 'processing', updated_at: { lt: before } }, take: 50 })
    for (const refund of refunds) {
      if (!refund.provider_refund_id) {
        await this.refunds.execute(refund.id)
        fixed++
        continue
      }
      const state = await this.provider.lookupRefund(refund.provider_refund_id).catch(() => null)
      if (state && state.state !== 'pending') {
        await this.refunds.applyProviderEvent({
          id: `reconcile:${refund.provider_refund_id}`,
          type: 'refund.updated',
          paymentId: null,
          providerRefundId: refund.provider_refund_id,
          refundId: refund.id,
          refundState: state.state,
          failureReason: state.failureReason,
        })
        fixed++
      }
    }
    return fixed
  }
}
