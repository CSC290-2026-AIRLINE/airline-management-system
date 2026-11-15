import { randomUUID } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { FareQuoteService } from '@backend/modules/pricing/fare-quote/fare-quote.service'
import { allocate, fromCents, splitProRata, toCents } from '../money'
import type { RefundReason } from '../payment-state'
import { PaymentErrorCode, paymentError } from '../payments.errors'
import { PAYMENT_PROVIDER, ProviderUnavailableError, type PaymentProvider, type ProviderEvent } from '../providers/payment-provider'
import { PaymentEngineService } from './payment-engine.service'
import { VoucherService } from './voucher.service'
import { FinancePostingService, PaymentMessagesService, ReceiptService, lockPayment, type Caller, type Tx } from './support.services'

type Staff = Extract<Caller, { kind: 'staff' }>

/** Stub fee until a coupon has a fare quote to read the fare rules from (phase 5 of the design). */
export const STUB_CANCEL_FEE_CENTS = 100_00

export interface RefundLineInput {
  paymentLineId: string
  amountCents: number
}

export interface CreateRefundInput {
  paymentId: string
  sourceKey: string
  reason: RefundReason
  method: 'original' | 'voucher'
  lines: RefundLineInput[]
  feeWithheldCents?: number
  requestedByUserId?: string | null
  caseCompensationId?: string | null
  status: 'requested' | 'pending_approval' | 'approved'
  note?: string | null
}

export interface PreviewLine {
  payment_line_id: string
  line_type: string
  description: string
  amount: string
  refundable: string
  fee: string
  refund: string
  rule: string
}

const LINE_FOR_CANCEL = ['fare', 'award_fee', 'seat_fee']

/**
 * 5b: every refund, whatever caused it, is one refund row with a unique source_key, split into refund_line rows per
 * payment line, and executed against the provider (or as a voucher). refund_line rows are written and
 * payment_line.refunded_amount raised under the payment's row lock in the same transaction, so a line can never be
 * refunded beyond what it charged; a rejected or failed refund gives its amounts back.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly engine: PaymentEngineService,
    private readonly vouchers: VoucherService,
    private readonly receipts: ReceiptService,
    private readonly postings: FinancePostingService,
    private readonly messages: PaymentMessagesService,
    private readonly audit: AuditService,
    private readonly fareQuotes: FareQuoteService,
  ) {}

  // ----- core -----------------------------------------------------------------------------------------------------

  /** Creates a refund in the caller's transaction. A repeat source_key returns the existing refund. */
  async createInTx(tx: Tx, input: CreateRefundInput) {
    await lockPayment(tx, input.paymentId)
    const existing = await tx.refund.findUnique({ where: { source_key: input.sourceKey } })
    if (existing) return { refund: existing, created: false }

    const payment = await tx.payment.findUnique({ where: { id: input.paymentId } })
    if (!payment) throw new NotFoundException(paymentError(PaymentErrorCode.PAYMENT_NOT_FOUND, 'Payment not found'))
    if (payment.status !== 'captured' && payment.status !== 'reversed') {
      throw new UnprocessableEntityException(
        paymentError(PaymentErrorCode.REFUND_EXCEEDS_PAID, `A ${payment.status} payment has nothing captured to refund`),
      )
    }

    const lines = await tx.payment_line.findMany({ where: { payment_id: payment.id } })
    let totalCents = 0
    for (const item of input.lines) {
      const line = lines.find((l) => l.id === item.paymentLineId)
      const room = line ? toCents(line.amount) - toCents(line.refunded_amount) : 0
      if (!line || item.amountCents <= 0 || item.amountCents > room) {
        throw new UnprocessableEntityException(
          paymentError(PaymentErrorCode.REFUND_EXCEEDS_PAID, 'A refund line is above what is still refundable on that line', {
            payment_line_id: item.paymentLineId,
            refundable: fromCents(Math.max(0, room)),
          }),
        )
      }
      totalCents += item.amountCents
    }
    if (totalCents <= 0) throw new UnprocessableEntityException(paymentError(PaymentErrorCode.REFUND_EXCEEDS_PAID, 'Nothing to refund'))
    if (input.method === 'voucher' && !payment.payer_customer_id) {
      throw new UnprocessableEntityException(
        paymentError(PaymentErrorCode.VOUCHER_INVALID, 'A payment with no customer account can only be refunded to the card'),
      )
    }

    // Mixed payment: the voucher share comes back as a new voucher, the rest goes to the card (remainder on the card).
    const voucherCents =
      input.method === 'voucher'
        ? totalCents
        : splitProRata(totalCents, toCents(payment.voucher_amount), toCents(payment.amount_total)).voucher

    const refund = await tx.refund.create({
      data: {
        payment_id: payment.id,
        source_key: input.sourceKey,
        reason: input.reason,
        method: input.method,
        status: input.status,
        amount: fromCents(totalCents),
        voucher_amount: fromCents(voucherCents),
        fee_withheld: fromCents(input.feeWithheldCents ?? 0),
        requested_by_user_id: input.requestedByUserId ?? null,
        case_compensation_id: input.caseCompensationId ?? null,
        decision_note: input.note?.trim() || null,
        requested_at: this.clock.now(),
      },
    })
    for (const item of input.lines) {
      await tx.refund_line.create({
        data: { refund_id: refund.id, payment_id: payment.id, payment_line_id: item.paymentLineId, amount: fromCents(item.amountCents) },
      })
      await tx.payment_line.update({
        where: { id: item.paymentLineId },
        data: { refunded_amount: { increment: fromCents(item.amountCents) } },
      })
    }
    return { refund, created: true }
  }

  async create(input: CreateRefundInput) {
    const result = await this.db.$transaction((tx) => this.createInTx(tx, input))
    if (result.refund.status === 'approved') await this.execute(result.refund.id)
    return this.db.refund.findUniqueOrThrow({ where: { id: result.refund.id } })
  }

  /** approved -> processing -> (provider) -> succeeded or failed. Safe to call again for a processing refund. */
  async execute(refundId: string): Promise<void> {
    const ready = await this.db.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId } })
      if (!refund) return null
      await lockPayment(tx, refund.payment_id)
      const fresh = await tx.refund.findUniqueOrThrow({ where: { id: refundId } })
      if (fresh.status === 'approved') {
        await tx.refund.update({ where: { id: refundId }, data: { status: 'processing', updated_at: new Date() } })
        return fresh
      }
      return fresh.status === 'processing' && !fresh.provider_refund_id ? fresh : null
    })
    if (!ready) return

    const payment = await this.db.payment.findUniqueOrThrow({ where: { id: ready.payment_id } })
    const cardCents = toCents(ready.amount) - toCents(ready.voucher_amount)
    if (cardCents <= 0 || payment.provider === 'none') {
      await this.complete(refundId)
      return
    }

    const attempt = await this.db.payment_attempt.findFirst({ where: { payment_id: payment.id, status: 'authorised' } })
    if (!attempt?.provider_intent_id) {
      await this.fail(refundId, 'The payment has no captured provider charge to refund')
      return
    }
    try {
      const result = await this.provider.refund({
        intentId: attempt.provider_intent_id,
        amountCents: cardCents,
        currency: payment.currency,
        idempotencyKey: ready.source_key,
        refundId,
      })
      await this.db.refund.updateMany({
        where: { id: refundId, provider_refund_id: null },
        data: { provider_refund_id: result.providerRefundId, updated_at: new Date() },
      })
      if (result.state === 'succeeded') await this.complete(refundId)
      if (result.state === 'failed') await this.fail(refundId, result.failureReason ?? 'Refund failed at the provider')
    } catch (error) {
      // Stays processing with no provider id; the reconcile job calls again with the same idempotency key.
      if (error instanceof ProviderUnavailableError) {
        this.logger.warn(`Refund ${refundId} could not reach the provider; the reconcile job will retry`)
        return
      }
      await this.fail(refundId, error instanceof Error ? error.message.slice(0, 300) : 'Refund failed')
    }
  }

  /** A refund webhook (refund.updated / refund.failed), or the same read by the reconcile job. */
  async applyProviderEvent(event: ProviderEvent): Promise<void> {
    const refund = await this.db.refund.findFirst({
      where: {
        OR: [
          ...(event.providerRefundId ? [{ provider_refund_id: event.providerRefundId }] : []),
          ...(event.refundId ? [{ id: event.refundId }] : []),
        ],
      },
    })
    if (!refund) return
    if (!refund.provider_refund_id && event.providerRefundId) {
      await this.db.refund.update({
        where: { id: refund.id },
        data: { provider_refund_id: event.providerRefundId, updated_at: new Date() },
      })
    }
    if (event.refundState === 'succeeded') await this.complete(refund.id)
    if (event.refundState === 'failed') await this.fail(refund.id, event.failureReason ?? 'Refund failed at the provider')
  }

  private async complete(refundId: string) {
    await this.db.$transaction(async (tx) => {
      const head = await tx.refund.findUniqueOrThrow({ where: { id: refundId } })
      await lockPayment(tx, head.payment_id)
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        include: { refund_line: { include: { payment_line: true } } },
      })
      if (refund.status !== 'processing') return
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.payment_id } })
      const now = this.clock.now()

      await tx.refund.update({
        where: { id: refundId },
        data: { status: 'succeeded', completed_at: now, failure_reason: null, updated_at: new Date() },
      })

      const voucherCents = toCents(refund.voucher_amount)
      if (voucherCents > 0 && payment.payer_customer_id) {
        await this.vouchers.issue(tx, {
          customerId: payment.payer_customer_id,
          amountCents: voucherCents,
          currency: payment.currency,
          refundId,
        })
      }

      const isCompensation = refund.reason === 'compensation'
      await this.postings.post(tx, {
        postingKey: `${isCompensation ? 'compensation_paid' : 'refund_succeeded'}:${refundId}`,
        postingType: isCompensation ? 'compensation_paid' : 'refund_succeeded',
        sourceType: 'refund',
        sourceId: refundId,
        currency: payment.currency,
        occurredAt: now,
        payload: {
          lines: [
            ...refund.refund_line.map((l) => ({ category: l.payment_line.line_type, amount: fromCents(toCents(l.amount)) })),
            ...(toCents(refund.fee_withheld) > 0
              ? [{ category: 'cancellation_fee', amount: fromCents(toCents(refund.fee_withheld)) }]
              : []),
          ],
          reason: refund.reason,
          payment_id: payment.id,
          voucher_amount: fromCents(voucherCents),
          card_amount: fromCents(toCents(refund.amount) - voucherCents),
          case_compensation_id: refund.case_compensation_id,
        },
      })

      const original = await tx.receipt.findFirst({ where: { payment_id: payment.id, refund_id: null } })
      await this.receipts.issue(tx, {
        paymentId: payment.id,
        refundId,
        documentType: 'credit_note',
        amountCents: toCents(refund.amount),
        billingName: original?.billing_name ?? null,
        issuedAt: now,
      })

      const lines = await tx.payment_line.findMany({ where: { payment_id: payment.id } })
      if (lines.every((l) => toCents(l.refunded_amount) >= toCents(l.amount))) await this.engine.move(tx, payment, 'reversed')

      if (payment.payer_customer_id) {
        await this.messages.send(tx, 'refund_issued', refundId, {
          customer_id: payment.payer_customer_id,
          refund_id: refundId,
          reference: payment.purchase_ref,
          amount: fromCents(toCents(refund.amount)),
          currency: payment.currency,
        })
      }
    })
  }

  /**
   * processing -> failed, or (problem 29) a late failure of a succeeded refund: back to failed, completed_at cleared,
   * line and payment amounts restored, refund_reversed posted, and a reversed payment moves back to captured.
   */
  private async fail(refundId: string, reason: string) {
    await this.db.$transaction(async (tx) => {
      const head = await tx.refund.findUniqueOrThrow({ where: { id: refundId } })
      await lockPayment(tx, head.payment_id)
      const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { refund_line: true } })
      if (refund.status !== 'processing' && refund.status !== 'succeeded') return
      const late = refund.status === 'succeeded'
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.payment_id } })

      await tx.refund.update({
        where: { id: refundId },
        data: { status: 'failed', completed_at: null, failure_reason: reason.slice(0, 500), updated_at: new Date() },
      })
      await this.restoreLines(tx, refund.refund_line)

      if (late) {
        await this.postings.post(tx, {
          postingKey: `refund_reversed:${refundId}`,
          postingType: 'refund_reversed',
          sourceType: 'refund',
          sourceId: refundId,
          currency: payment.currency,
          occurredAt: this.clock.now(),
          payload: { lines: [{ category: 'refund', amount: fromCents(toCents(refund.amount)) }], reason },
        })
        await this.engine.move(tx, payment, 'captured')
        // The voucher share was issued as credit; take it back if it is still unused.
        await tx.compensation_voucher.updateMany({
          where: { refund_id: refundId, status: 'active' },
          data: { status: 'cancelled', cancel_reason: 'The refund it came from failed', updated_at: new Date() },
        })
      }
      if (payment.payer_customer_id) {
        await this.messages.send(tx, 'refund_failed', refundId, {
          customer_id: payment.payer_customer_id,
          refund_id: refundId,
          reference: payment.purchase_ref,
        })
      }
    })
  }

  private async restoreLines(tx: Tx, lines: { payment_line_id: string; amount: unknown }[]) {
    for (const line of lines) {
      await tx.payment_line.update({
        where: { id: line.payment_line_id },
        data: { refunded_amount: { decrement: fromCents(toCents(line.amount as string)) } },
      })
    }
  }

  // ----- customer cancel (feature 3b) -----------------------------------------------------------------------------

  /** The fee and refund 5b will pay on a customer cancel, per line. 3b's cancellation preview shows exactly this. */
  async preview(bookingId: string) {
    const payment = await this.livePaymentForBooking(bookingId)
    if (!payment) return null
    const lines = await this.db.payment_line.findMany({
      where: { payment_id: payment.id },
      orderBy: { created_at: 'asc' },
      include: { booking_coupon: { select: { id: true, fare_quote_id: true } } },
    })

    const preview: PreviewLine[] = []
    const fareRatio = new Map<string, number>() // coupon id -> refund share of its fare line
    for (const line of lines.filter((l) => l.line_type !== 'seat_fee')) {
      const room = toCents(line.amount) - toCents(line.refunded_amount)
      if (!LINE_FOR_CANCEL.includes(line.line_type) || room <= 0) continue
      let fee = 0
      let rule = '100% refundable'
      if (line.line_type === 'fare') {
        const quoteId = line.booking_coupon?.fare_quote_id
        const quoted = quoteId ? await this.fareQuotes.fee(quoteId, 'cancel').catch(() => null) : null
        if (quoted && !quoted.allowed) {
          fee = room
          rule = 'Fare is not refundable'
        } else if (quoted) {
          fee = Math.min(room, toCents(quoted.fee ?? 0))
          rule = `Fare rule: ${quoted.flat} flat + ${quoted.pct}%`
        } else {
          fee = Math.min(room, STUB_CANCEL_FEE_CENTS)
          rule = 'Flat cancellation fee (no fare rule on this coupon)'
        }
        if (line.booking_coupon_id) fareRatio.set(line.booking_coupon_id, room > 0 ? (room - fee) / room : 0)
      }
      preview.push(this.previewLine(line, room, fee, rule))
    }
    // Seat fees follow the same percentage as the fare of their coupon.
    for (const line of lines.filter((l) => l.line_type === 'seat_fee')) {
      const room = toCents(line.amount) - toCents(line.refunded_amount)
      if (room <= 0) continue
      const ratio = line.booking_coupon_id ? (fareRatio.get(line.booking_coupon_id) ?? 1) : 1
      const refund = Math.floor(room * ratio)
      preview.push(this.previewLine(line, room, room - refund, `Same share as the fare (${Math.round(ratio * 100)}%)`))
    }

    const refundCents = preview.reduce((s, l) => s + toCents(l.refund), 0)
    const split = splitProRata(refundCents, toCents(payment.voucher_amount), toCents(payment.amount_total))
    return {
      payment_id: payment.id,
      payment_status: payment.status,
      currency: payment.currency,
      lines: preview,
      fee_total: fromCents(preview.reduce((s, l) => s + toCents(l.fee), 0)),
      refund_total: fromCents(refundCents),
      to_card: fromCents(split.card),
      to_voucher: fromCents(split.voucher),
    }
  }

  /**
   * Feature 3b calls this when a booking is cancelled. A booking whose capture stalled is only authorised: its
   * authorisation is voided instead, and nothing is refunded. Cancelling twice refunds once.
   */
  async refundCustomerCancel(bookingId: string, requestedByUserId: string | null = null) {
    const payment = await this.livePaymentForBooking(bookingId)
    if (!payment) return { outcome: 'no_payment' as const }
    if (payment.status === 'authorised') {
      await this.engine.voidPayment(payment.id, 'Booking cancelled before capture')
      return { outcome: 'voided' as const, payment_id: payment.id }
    }
    const existing = await this.db.refund.findUnique({ where: { source_key: `customer_cancel:${bookingId}` } })
    if (existing) return { outcome: 'refunded' as const, refund: existing }

    const preview = await this.preview(bookingId)
    const lines = (preview?.lines ?? []).filter((l) => toCents(l.refund) > 0)
    if (!preview || lines.length === 0) return { outcome: 'nothing_refundable' as const, preview }
    const refund = await this.create({
      paymentId: payment.id,
      sourceKey: `customer_cancel:${bookingId}`,
      reason: 'customer_cancel',
      method: 'original',
      lines: lines.map((l) => ({ paymentLineId: l.payment_line_id, amountCents: toCents(l.refund) })),
      feeWithheldCents: toCents(preview.fee_total),
      requestedByUserId,
      status: 'approved',
    })
    return { outcome: 'refunded' as const, refund }
  }

  // ----- airline cancel (feature 2) -------------------------------------------------------------------------------

  /**
   * flight.cancelled with resolution refund: 100% of the fare, award and seat lines of every paid coupon on that
   * flight, from 5b's own payment_line rows (no coupon status lookup). The receipt row makes a replay a no-op.
   */
  async handleFlightCancelled(eventId: string): Promise<number> {
    const event = await this.db.flight_event.findUnique({ where: { id: eventId } })
    if (!event || event.type !== 'cancelled' || event.resolution !== 'refund') return 0

    const refundIds = await this.db.$transaction(async (tx) => {
      const receipt = await tx.refund_event_receipt.createMany({
        data: [{ event_id: eventId, processed_at: this.clock.now() }],
        skipDuplicates: true,
      })
      if (receipt.count === 0) return []
      const lines = await tx.payment_line.findMany({
        where: {
          line_type: { in: LINE_FOR_CANCEL },
          booking_coupon: { flight_id: event.flight_id },
          payment_payment_line_payment_idTopayment: { status: { in: ['captured', 'reversed'] } },
        },
        orderBy: { created_at: 'asc' },
      })
      const byPayment = new Map<string, RefundLineInput[]>()
      for (const line of lines) {
        const room = toCents(line.amount) - toCents(line.refunded_amount)
        if (room > 0)
          byPayment.set(line.payment_id, [...(byPayment.get(line.payment_id) ?? []), { paymentLineId: line.id, amountCents: room }])
      }
      const ids: string[] = []
      for (const [paymentId, refundLines] of byPayment) {
        const { refund } = await this.createInTx(tx, {
          paymentId,
          sourceKey: `flight_cancelled:${eventId}:${paymentId}`,
          reason: 'flight_cancelled',
          method: 'original',
          lines: refundLines,
          status: 'approved',
        })
        ids.push(refund.id)
      }
      return ids
    })
    for (const id of refundIds) await this.execute(id)
    return refundIds.length
  }

  /** On startup (and each job pass): every refund-resolution cancellation without a receipt, in seq order. */
  async catchUpFlightCancellations(): Promise<number> {
    const pending = await this.db.flight_event.findMany({
      where: { type: 'cancelled', resolution: 'refund', refund_event_receipt: null },
      orderBy: { seq: 'asc' },
      select: { id: true },
      take: 50,
    })
    let refunds = 0
    for (const event of pending) refunds += await this.handleFlightCancelled(event.id)
    return refunds
  }

  // ----- cargo (feature 17, in-process) ---------------------------------------------------------------------------

  /**
   * For feature 17 when it cancels, rejects or re-weighs lower. `amountCents` defaults to everything still refundable
   * (cargo_rejected, or a cancel before acceptance); 17 passes the refundable amount after acceptance or the re-weigh
   * difference. Source keys are per cargo booking, so a repeat refunds once.
   */
  async refundCargo(input: {
    cargoBookingId: string
    reason: 'cargo_cancel' | 'cargo_rejected' | 'cargo_reweigh'
    amountCents?: number
    feeCents?: number
  }) {
    const payment = await this.db.payment.findFirst({
      where: {
        cargo_booking_id: input.cargoBookingId,
        source_feature: 17,
        purchase_ref: `cargo_booking:${input.cargoBookingId}`,
        status: { in: ['authorised', 'captured', 'reversed'] },
      },
    })
    if (!payment) return { outcome: 'no_payment' as const }
    if (payment.status === 'authorised') {
      await this.engine.voidPayment(payment.id, `${input.reason} before capture`)
      return { outcome: 'voided' as const, payment_id: payment.id }
    }
    const lines = await this.refundableLines(payment.id)
    const total = lines.reduce((s, l) => s + l.room, 0)
    const amount = Math.min(input.amountCents ?? total, total)
    const allocation = allocate(lines, amount)
    if (!allocation || amount <= 0) return { outcome: 'nothing_refundable' as const }
    const refund = await this.create({
      paymentId: payment.id,
      sourceKey: `${input.reason}:${input.cargoBookingId}`,
      reason: input.reason,
      method: 'original',
      lines: allocation.map((a) => ({ paymentLineId: a.line.id, amountCents: a.amount })),
      feeWithheldCents: input.feeCents ?? 0,
      status: 'approved',
    })
    return { outcome: 'refunded' as const, refund }
  }

  // ----- customer request -----------------------------------------------------------------------------------------

  /** POST /refund-requests: a customer asks for a refund outside a cancel. Staff decide. */
  async requestByCustomer(
    customer: Extract<Caller, { kind: 'customer' }>,
    input: { paymentId: string; paymentLineId?: string; note: string },
  ) {
    const payment = await this.db.payment.findUnique({ where: { id: input.paymentId } })
    if (!payment || payment.payer_customer_id !== customer.customerId) {
      throw new NotFoundException(paymentError(PaymentErrorCode.PAYMENT_NOT_FOUND, 'Payment not found'))
    }
    const lines = (await this.refundableLines(payment.id)).filter((l) => !input.paymentLineId || l.id === input.paymentLineId)
    if (lines.length === 0)
      throw new UnprocessableEntityException(
        paymentError(PaymentErrorCode.REFUND_EXCEEDS_PAID, 'Nothing is left to refund on this payment'),
      )
    return this.create({
      paymentId: payment.id,
      sourceKey: `customer_request:${payment.id}:${input.paymentLineId ?? 'all'}`,
      reason: 'customer_request',
      method: 'original',
      lines: lines.map((l) => ({ paymentLineId: l.id, amountCents: l.room })),
      requestedByUserId: customer.userId,
      status: 'requested',
      note: input.note,
    })
  }

  // ----- staff ----------------------------------------------------------------------------------------------------

  /**
   * POST /staff/refunds. Within policy (no more than the fare rules allow, before check-in, no fee waived) it is
   * approved at once; otherwise it waits in pending_approval for an admin.
   */
  async createByStaff(
    staff: Staff,
    input: {
      paymentId: string
      reason: 'customer_request' | 'staff_adjustment' | 'rebook_difference'
      method: 'original' | 'voucher'
      amountCents: number
      paymentLineId?: string
      waiveFee?: boolean
      note: string
    },
  ) {
    const lines = (await this.refundableLines(input.paymentId)).filter((l) => !input.paymentLineId || l.id === input.paymentLineId)
    const allocation = allocate(lines, input.amountCents)
    if (!allocation) {
      throw new UnprocessableEntityException(
        paymentError(PaymentErrorCode.REFUND_EXCEEDS_PAID, 'The amount is above what is still refundable', {
          refundable: fromCents(lines.reduce((s, l) => s + l.room, 0)),
        }),
      )
    }
    const policy = await this.policyCheck(input.paymentId, input.amountCents, input.paymentLineId)
    const needsApproval = !policy.within || Boolean(input.waiveFee)
    const payment = await this.db.payment.findUniqueOrThrow({ where: { id: input.paymentId }, select: { booking_id: true } })
    const sourceKey =
      input.reason === 'rebook_difference' && payment.booking_id
        ? `rebook_difference:${payment.booking_id}`
        : `${input.reason}:${input.paymentId}:${randomUUID()}`
    const refund = await this.create({
      paymentId: input.paymentId,
      sourceKey,
      reason: input.reason,
      method: input.method,
      lines: allocation.map((a) => ({ paymentLineId: a.line.id, amountCents: a.amount })),
      requestedByUserId: staff.userId,
      status: needsApproval ? 'pending_approval' : 'approved',
      note: input.note,
    })
    return { refund, needs_approval: needsApproval, policy }
  }

  /** PUT /staff/refunds/:id. */
  async decide(staff: Staff, refundId: string, action: 'approve' | 'reject' | 'reissue_voucher', note: string) {
    const refund = await this.db.refund.findUnique({ where: { id: refundId } })
    if (!refund) throw new NotFoundException(paymentError(PaymentErrorCode.REFUND_NOT_FOUND, 'Refund not found'))

    if (action === 'reissue_voucher') return this.reissueAsVoucher(staff, refund.id, note)

    if (refund.status !== 'requested' && refund.status !== 'pending_approval') {
      throw new ConflictException(paymentError(PaymentErrorCode.REFUND_NOT_ACTIONABLE, `A ${refund.status} refund cannot be ${action}d`))
    }

    if (action === 'reject') {
      await this.db.$transaction(async (tx) => {
        await lockPayment(tx, refund.payment_id)
        const fresh = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { refund_line: true } })
        if (fresh.status !== 'requested' && fresh.status !== 'pending_approval') return
        await tx.refund.update({
          where: { id: refundId },
          data: { status: 'rejected', decision_note: note.trim(), updated_at: new Date() },
        })
        await this.restoreLines(tx, fresh.refund_line)
      })
      return this.db.refund.findUniqueOrThrow({ where: { id: refundId } })
    }

    // Approve. A pending_approval refund, or a requested one outside policy, needs an admin.
    const policy = await this.policyCheck(refund.payment_id, toCents(refund.amount))
    const needsAdmin = refund.status === 'pending_approval' || !policy.within
    if (needsAdmin && !staff.isAdmin) {
      throw new ForbiddenException(
        paymentError(PaymentErrorCode.REFUND_NEEDS_APPROVAL, 'This refund is outside policy and needs an admin approval'),
      )
    }
    await this.db.$transaction(async (tx) => {
      await lockPayment(tx, refund.payment_id)
      const fresh = await tx.refund.findUniqueOrThrow({ where: { id: refundId } })
      if (fresh.status !== 'requested' && fresh.status !== 'pending_approval') return
      const entry = await this.audit.write(
        {
          actor: { type: 'staff', id: staff.userId, role: staff.roleCode },
          sourceFeature: '5',
          action: 'status_change',
          entityType: 'refund',
          entityId: refundId,
          summary: `Approved refund of ${fromCents(toCents(fresh.amount))} (${fresh.reason})${needsAdmin ? ' outside policy' : ''}`,
          reason: note,
          before: { status: fresh.status },
          after: { status: 'approved' },
        },
        tx,
      )
      await tx.refund.update({
        where: { id: refundId },
        data: { status: 'approved', audit_log_id: entry.id, decision_note: note.trim(), updated_at: new Date() },
      })
    })
    await this.execute(refundId)
    return this.db.refund.findUniqueOrThrow({ where: { id: refundId } })
  }

  /** A failed refund paid instead as a voucher, with the customer's consent (source key reissue:<refund id>). */
  private async reissueAsVoucher(staff: Staff, refundId: string, note: string) {
    const refund = await this.db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { refund_line: true } })
    if (refund.status !== 'failed') {
      throw new ConflictException(paymentError(PaymentErrorCode.REFUND_NOT_ACTIONABLE, 'Only a failed refund can be reissued as a voucher'))
    }
    return this.create({
      paymentId: refund.payment_id,
      sourceKey: `reissue:${refundId}`,
      reason: refund.reason as RefundReason,
      method: 'voucher',
      lines: refund.refund_line.map((l) => ({ paymentLineId: l.payment_line_id, amountCents: toCents(l.amount) })),
      feeWithheldCents: toCents(refund.fee_withheld),
      requestedByUserId: staff.userId,
      caseCompensationId: null,
      status: 'approved',
      note,
    })
  }

  // ----- compensation (feature 13) --------------------------------------------------------------------------------

  /**
   * Pays one feature 13 compensation decision, as a card refund (capped at what is refundable on the chosen payment)
   * or a voucher. The decision id is the idempotency key. Feature 13 records the result and the payout_ref.
   */
  async payCompensation(
    staff: Staff,
    input: { caseCompensationId: string; form?: 'refund' | 'voucher'; paymentId?: string; amountCents?: number },
  ) {
    const decision = await this.db.case_compensation.findUnique({
      where: { id: input.caseCompensationId },
      include: { complaint_case: { select: { customer_id: true, case_number: true } } },
    })
    if (!decision) throw new NotFoundException(paymentError(PaymentErrorCode.COMPENSATION_NOT_PAYABLE, 'Compensation decision not found'))

    const [refund, voucher] = await Promise.all([
      this.db.refund.findUnique({ where: { case_compensation_id: decision.id } }),
      this.db.compensation_voucher.findUnique({ where: { case_compensation_id: decision.id } }),
    ])
    if (refund && refund.status !== 'failed' && refund.status !== 'rejected')
      return { form: 'refund' as const, refund, payout_ref: refund.id }
    if (voucher) return { form: 'voucher' as const, voucher, payout_ref: voucher.code }

    const form = input.form ?? (decision.type === 'voucher' ? 'voucher' : 'refund')
    const amountCents = input.amountCents ?? toCents(decision.amount)
    const customerId = decision.complaint_case.customer_id
    if (amountCents <= 0)
      throw new UnprocessableEntityException(paymentError(PaymentErrorCode.COMPENSATION_NOT_PAYABLE, 'The amount must be above 0'))

    if (form === 'voucher') {
      if (!customerId) {
        throw new UnprocessableEntityException(
          paymentError(PaymentErrorCode.COMPENSATION_NOT_PAYABLE, 'A case with no customer account can only be paid as a refund'),
        )
      }
      const currency = (await this.db.pricing_setting.findUnique({ where: { key: 'base_currency' } }))?.value ?? 'USD'
      const issued = await this.db.$transaction((tx) =>
        this.vouchers.issue(tx, { customerId, amountCents, currency, caseCompensationId: decision.id }),
      )
      return { form: 'voucher' as const, voucher: issued, payout_ref: issued.code }
    }

    if (!input.paymentId) {
      throw new UnprocessableEntityException(paymentError(PaymentErrorCode.COMPENSATION_NOT_PAYABLE, 'Pick the payment to refund to'))
    }
    const payment = await this.db.payment.findUnique({ where: { id: input.paymentId } })
    if (!payment || (customerId && payment.payer_customer_id !== customerId)) {
      throw new NotFoundException(paymentError(PaymentErrorCode.PAYMENT_NOT_FOUND, "Payment not found for this case's customer"))
    }
    const lines = await this.refundableLines(payment.id)
    const allocation = allocate(lines, amountCents)
    if (!allocation) {
      throw new UnprocessableEntityException(
        paymentError(PaymentErrorCode.REFUND_EXCEEDS_PAID, 'More than is refundable on this payment; pay the rest as a voucher', {
          refundable: fromCents(lines.reduce((s, l) => s + l.room, 0)),
        }),
      )
    }
    const created = await this.create({
      paymentId: payment.id,
      sourceKey: `compensation:${decision.id}`,
      reason: 'compensation',
      method: 'original',
      lines: allocation.map((a) => ({ paymentLineId: a.line.id, amountCents: a.amount })),
      requestedByUserId: staff.userId,
      caseCompensationId: decision.id,
      status: 'approved',
      note: decision.reason,
    })
    return { form: 'refund' as const, refund: created, payout_ref: created.id }
  }

  /** Feature 13 decisions owed and not yet paid, for the staff Compensation page. */
  async pendingCompensations() {
    const decisions = await this.db.case_compensation.findMany({
      where: { status: 'pending', refund: null, compensation_voucher: null },
      orderBy: { decided_at: 'desc' },
      take: 100,
      include: { complaint_case: { select: { case_number: true, customer_id: true, contact_email: true } } },
    })
    return Promise.all(
      decisions.map(async (d) => {
        const customerId = d.complaint_case.customer_id
        const payments = customerId
          ? await this.db.payment.findMany({
              where: { payer_customer_id: customerId, status: 'captured' },
              orderBy: { captured_at: 'desc' },
              take: 10,
              select: { id: true, purchase_ref: true, currency: true, booking: { select: { booking_reference: true } } },
            })
          : []
        const withCap = await Promise.all(
          payments.map(async (p) => ({ ...p, refundable: fromCents((await this.refundableLines(p.id)).reduce((s, l) => s + l.room, 0)) })),
        )
        return { ...d, payments: withCap }
      }),
    )
  }

  // ----- reads ----------------------------------------------------------------------------------------------------

  listMine(customerId: string) {
    return this.db.refund.findMany({
      where: { payment: { payer_customer_id: customerId } },
      orderBy: { requested_at: 'desc' },
      take: 100,
      include: { payment: { select: { purchase_ref: true, currency: true, booking: { select: { booking_reference: true } } } } },
    })
  }

  /** Refund queue: rows needing approval first, then newest. */
  async listForStaff(status?: string) {
    const rows = await this.db.refund.findMany({
      where: status ? { status } : {},
      orderBy: { requested_at: 'desc' },
      take: 200,
      include: {
        payment: {
          select: {
            id: true,
            currency: true,
            purchase_ref: true,
            booking: { select: { booking_reference: true } },
            customer: { select: { passenger: { select: { first_name: true, last_name: true } } } },
          },
        },
      },
    })
    const rank = (s: string) => (s === 'pending_approval' ? 0 : s === 'requested' ? 1 : s === 'failed' ? 2 : 3)
    return rows.sort((a, b) => rank(a.status) - rank(b.status))
  }

  async get(caller: Caller, refundId: string) {
    const refund = await this.db.refund.findUnique({
      where: { id: refundId },
      include: {
        refund_line: { include: { payment_line: { select: { line_type: true, description: true, amount: true } } } },
        payment: {
          select: {
            id: true,
            status: true,
            currency: true,
            purchase_ref: true,
            payer_customer_id: true,
            amount_total: true,
            voucher_amount: true,
            booking: { select: { id: true, booking_reference: true } },
          },
        },
        receipt: { select: { document_number: true, issued_at: true } },
        compensation_voucher: { select: { code: true, status: true } },
        audit_log: { select: { id: true, occurred_at: true, actor_role: true, reason: true } },
      },
    })
    if (!refund || (caller.kind === 'customer' && refund.payment.payer_customer_id !== caller.customerId)) {
      throw new NotFoundException(paymentError(PaymentErrorCode.REFUND_NOT_FOUND, 'Refund not found'))
    }
    if (caller.kind === 'customer') {
      const { audit_log: _audit, ...rest } = refund
      void _audit
      return rest
    }
    const policy = await this.policyCheck(refund.payment_id, toCents(refund.amount))
    return { ...refund, policy }
  }

  /** Payments with a stalled capture, and refunds that failed. */
  async exceptions() {
    const [stalled, failed] = await Promise.all([
      this.db.payment.findMany({
        where: { capture_stalled_at: { not: null }, status: 'authorised' },
        orderBy: { capture_stalled_at: 'asc' },
        include: {
          booking: { select: { booking_reference: true } },
          cargo_booking_payment_cargo_booking_idTocargo_booking: { select: { booking_ref: true } },
        },
      }),
      this.db.refund.findMany({
        where: { status: 'failed' },
        orderBy: { updated_at: 'desc' },
        take: 100,
        include: {
          payment: { select: { id: true, currency: true, purchase_ref: true, booking: { select: { booking_reference: true } } } },
        },
      }),
    ])
    return { stalled_captures: stalled, failed_refunds: failed }
  }

  // ----- helpers --------------------------------------------------------------------------------------------------

  private previewLine(
    line: { id: string; line_type: string; description: string; amount: unknown },
    room: number,
    fee: number,
    rule: string,
  ): PreviewLine {
    return {
      payment_line_id: line.id,
      line_type: line.line_type,
      description: line.description,
      amount: fromCents(toCents(line.amount as string)),
      refundable: fromCents(room),
      fee: fromCents(fee),
      refund: fromCents(room - fee),
      rule,
    }
  }

  private async livePaymentForBooking(bookingId: string) {
    return this.db.payment.findFirst({
      where: { source_feature: 3, purchase_ref: `booking:${bookingId}`, status: { in: ['authorised', 'captured', 'reversed'] } },
    })
  }

  async refundableLines(paymentId: string) {
    const lines = await this.db.payment_line.findMany({ where: { payment_id: paymentId }, orderBy: { created_at: 'asc' } })
    return lines.map((l) => ({ ...l, room: toCents(l.amount) - toCents(l.refunded_amount) })).filter((l) => l.room > 0)
  }

  /**
   * Within policy = no more than the fare rules would refund on a cancel today, and nothing checked in yet. Used to
   * decide whether a staff refund needs an admin.
   */
  async policyCheck(paymentId: string, amountCents: number, paymentLineId?: string) {
    const payment = await this.db.payment.findUnique({ where: { id: paymentId }, select: { booking_id: true, source_feature: true } })
    let policyCents = (await this.refundableLines(paymentId))
      .filter((l) => !paymentLineId || l.id === paymentLineId)
      .reduce((s, l) => s + l.room, 0)
    let checkedIn = false
    if (payment?.booking_id && payment.source_feature === 3) {
      const preview = await this.preview(payment.booking_id)
      if (preview) {
        policyCents = preview.lines
          .filter((l) => !paymentLineId || l.payment_line_id === paymentLineId)
          .reduce((s, l) => s + toCents(l.refund), 0)
      }
      checkedIn =
        (await this.db.check_in.count({
          where: { status: { not: 'cancelled' }, booking_coupon: { booking_id: payment.booking_id } },
        })) > 0
    }
    return { within: amountCents <= policyCents && !checkedIn, policy_amount: fromCents(policyCents), checked_in: checkedIn }
  }
}
