import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { PAYMENT_REPOSITORY, type PaymentRepository } from './payment.repository'
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment.gateway'
import { matchesStaffFilter, STATUS_LABELS, SOURCE_FEATURE_LABELS, toCustomerState } from './payment-status'
import {
  customerName,
  MOCK_BOOKING_REFERENCE,
  MOCK_CARGO_REFERENCE,
  MOCK_BOOKING_REFUND_STATE,
  MOCK_MILES_REDEEMED,
  resolveCustomerId,
} from './mock-booking-state'
import type {
  PaymentAttemptRecord,
  PaymentExceptionResolution,
  PaymentExceptionState,
  PaymentLineRecord,
  PaymentRecord,
  PaymentSourceFeature,
  PaymentStatus,
  ReceiptRecord,
} from './payment.types'
import type { ReceiptQueryDto } from './dto/receipt-query.dto'
import type { StaffPaymentQueryDto } from './dto/staff-payment-query.dto'
import type { PaymentExceptionTab } from './dto/payment-exceptions-query.dto'
import type {
  ListDto,
  PaymentLineDto,
  PaymentStatusDto,
  ReceiptDetailDto,
  ReceiptSummaryDto,
  RefundState,
  StaffPaymentDetailDto,
  StaffPaymentSummaryDto,
} from './dto/payments-checkout.types'

/**
 * Mirrors `payment_setting.capture_retry_limit` (5).
 *
 * TODO(F5a): read it from the `payment_setting` table once the database is live.
 */
const CAPTURE_RETRY_LIMIT = 5

/** The base currency every payment is started in. TODO(F5a): read it from a `payment_setting` row. */
const BASE_CURRENCY = 'USD'

/** The default number of rows a list endpoint returns. */
const DEFAULT_LIMIT = 50

/** Money is a JS number rounded to two decimals in the mock; the real implementation uses Prisma `Decimal`. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** What a selling feature hands to 5a when it starts a payment. */
export interface CreatePaymentInput {
  /** The selling feature that owns the purchase: 3 (booking), 6 (excess baggage), 12 (onboard) or 17 (cargo). */
  source_feature: PaymentSourceFeature
  /** The selling feature's own key for what is bought, e.g. `booking:<id>`. */
  purchase_ref: string
  payer_customer_id: string | null
  booking_id?: string | null
  cargo_booking_id?: string | null
  voucher_id?: string | null
  /** The key the caller retries with. Replaying it returns the payment that already exists. */
  idempotency_key: string
  currency?: string
  /** The total the customer owes. 5a never prices — the selling feature passes the number in. */
  amount_total: number
  /** The share covered by a compensation voucher (Feature 5b). Miles are not money and are not stored here. */
  voucher_amount?: number
  lines: {
    line_type: PaymentLineRecord['line_type']
    description: string
    amount: number
    source_ref?: string | null
    booking_coupon_id?: string | null
  }[]
  started_at?: Date
  /** The deadline: the booking's hold end, or the selling feature's own deadline. */
  expires_at: Date
}

/**
 * Feature 5a's service.
 *
 * Two audiences:
 *
 * 1. **The selling features (3b, 6, 12, 17) call this in process** — they never talk to it over HTTP and 5a never
 *    imports them. They create a payment, then hand the seller's own confirmation back so 5a can settle it.
 * 2. **The frontends read it over HTTP** — the customer's receipts and the staff payment lookup and exceptions.
 *
 * The invariants the schema enforces with CHECK constraints are enforced here instead, because the mock has no
 * database to enforce them:
 *
 * - `amount_total = voucher_amount + card_amount`, and the provider is `none` exactly when `card_amount` is 0.
 * - `amount_total > 0` unless the source feature is 3 (the zero-cash award booking).
 * - The source feature's booking: 3 and 6 need a `booking_id`, 17 needs a `cargo_booking_id`, and never both.
 * - `expires_at > started_at`.
 * - The lines add up to `amount_total`.
 * - One live payment per purchase, and one payment per idempotency key.
 * - `authorised_at` is set exactly for `authorised | captured | voided | reversed`; `voided_at` exactly for `voided`;
 *   `capture_stalled_at` only while the payment is `authorised`.
 */
@Injectable()
export class PaymentsCheckoutService {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly repo: PaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly clock: SimulationClock,
    private readonly audit: AuditService,
  ) {}

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  The in-process API the selling features call                              */
  /* ──────────────────────────────────────────────────────────────────────────── */

  /**
   * Starts a payment for a purchase. The selling feature owns the price and the deadline; 5a only records them.
   *
   * Replaying an idempotency key returns the payment that already exists, so a double click or a retried request
   * cannot pay twice. A second *live* payment for the same purchase is refused.
   */
  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const now = this.clock.now()
    const amountTotal = round2(input.amount_total)
    const voucherAmount = round2(input.voucher_amount ?? 0)
    const cardAmount = round2(amountTotal - voucherAmount)
    const startedAt = input.started_at ?? now

    if (amountTotal < 0 || voucherAmount < 0 || cardAmount < 0) {
      throw new BadRequestException('Payment amounts must not be negative')
    }
    if (amountTotal === 0 && input.source_feature !== 3) {
      throw new BadRequestException('Only a flight booking (source feature 3) may be a zero-cash payment')
    }
    if ((input.source_feature === 3 || input.source_feature === 6) && !input.booking_id) {
      throw new BadRequestException(`A payment from source feature ${input.source_feature} needs a booking_id`)
    }
    if (input.source_feature === 17 && !input.cargo_booking_id) {
      throw new BadRequestException('A cargo payment needs a cargo_booking_id')
    }
    if (input.booking_id && input.cargo_booking_id) {
      throw new BadRequestException('A payment belongs to a booking or a cargo booking, not both')
    }
    if (input.expires_at <= startedAt) {
      throw new BadRequestException('expires_at must be after started_at')
    }
    const linesTotal = round2(input.lines.reduce((sum, line) => sum + line.amount, 0))
    if (linesTotal !== amountTotal) {
      throw new BadRequestException(`Payment lines add up to ${linesTotal}, not ${amountTotal}`)
    }

    const replay = this.repo.findByIdempotencyKey(input.payer_customer_id, input.idempotency_key)
    if (replay) return replay

    const live = this.repo.findLiveByPurchaseRef(input.source_feature, input.purchase_ref)
    if (live) {
      throw new ConflictException(`Purchase ${input.purchase_ref} already has a live payment (${live.id})`)
    }

    const payment: PaymentRecord = {
      id: randomUUID(),
      source_feature: input.source_feature,
      purchase_ref: input.purchase_ref,
      payer_customer_id: input.payer_customer_id,
      booking_id: input.booking_id ?? null,
      cargo_booking_id: input.cargo_booking_id ?? null,
      voucher_id: input.voucher_id ?? null,
      idempotency_key: input.idempotency_key,
      status: 'created',
      provider: cardAmount === 0 ? 'none' : this.gateway.name,
      currency: input.currency ?? BASE_CURRENCY,
      amount_total: amountTotal,
      voucher_amount: voucherAmount,
      card_amount: cardAmount,
      provider_fee: null,
      capture_attempts: 0,
      last_error: null,
      started_at: startedAt,
      expires_at: input.expires_at,
      authorised_at: null,
      captured_at: null,
      voided_at: null,
      capture_stalled_at: null,
      created_at: now,
      updated_at: now,
      lines: input.lines.map((line, index) => ({
        id: `${input.idempotency_key}-line-${index + 1}`,
        payment_id: '',
        booking_id: input.booking_id ?? null,
        booking_coupon_id: line.booking_coupon_id ?? null,
        line_type: line.line_type,
        source_ref: line.source_ref ?? null,
        description: line.description,
        amount: round2(line.amount),
        refunded_amount: 0,
        created_at: now,
      })),
      attempts: [],
    }
    payment.lines = payment.lines.map((line) => ({ ...line, payment_id: payment.id }))

    return this.repo.insert(payment)
  }

  /**
   * The 5a flow: authorise → call the selling feature's confirm → capture on yes, void on no.
   *
   * `confirm` is the selling feature's own confirmation, passed in as a callback so that 5a never imports another
   * team's internals: 3b confirms the booking, 6 confirms the bags are tagged, 12 confirms the onboard order, 17
   * confirms the cargo. A `false` from it means the sale did not happen.
   */
  async confirmAndSettle(paymentId: string, confirm: () => Promise<boolean>): Promise<PaymentRecord> {
    const payment = this.requirePayment(paymentId)
    if (payment.status !== 'created') {
      throw new ConflictException(`Payment ${paymentId} is ${payment.status}; it is not waiting for confirmation`)
    }
    const now = this.clock.now()

    // A zero-cash award booking: there is no card, so there is nothing to authorise and nothing to void. The seller's
    // confirmation is all there is, and the payment goes straight from `created` to `captured`.
    if (payment.provider === 'none') {
      const confirmed = await confirm()
      if (!confirmed) {
        payment.status = 'failed'
        payment.last_error = 'seller_declined'
        payment.updated_at = now
        return this.repo.update(payment)
      }
      payment.status = 'captured'
      payment.authorised_at = now
      payment.captured_at = now
      payment.updated_at = now
      this.issueReceipt(payment)
      return this.repo.update(payment)
    }

    const authorisation = await this.gateway.authorise({
      payment_id: payment.id,
      amount: payment.card_amount,
      currency: payment.currency,
      idempotency_key: payment.idempotency_key,
    })
    payment.attempts.push(this.buildAttempt(payment, authorisation))
    payment.updated_at = now

    if (!authorisation.ok) {
      payment.status = 'failed'
      payment.last_error = authorisation.failure_code ?? 'authorisation_failed'
      return this.repo.update(payment)
    }

    payment.status = 'authorised'
    payment.authorised_at = now
    this.repo.update(payment)

    const confirmed = await confirm()
    if (!confirmed) {
      return this.voidPayment(payment.id, 'seller_declined')
    }
    return this.capturePayment(payment)
  }

  /**
   * Captures an authorised payment. Staff call this to retry a capture that stalled.
   *
   * The payment stays `authorised` when the capture fails. Once it has failed `capture_retry_limit` times the payment
   * is capture-stalled: it stays `authorised`, gets a `capture_stalled_at`, and lands on the staff exception list.
   */
  async retryCapture(paymentId: string, actor?: string | null, note?: string | null): Promise<PaymentRecord> {
    const payment = this.requirePayment(paymentId)
    if (payment.status !== 'authorised') {
      throw new ConflictException(`Only an authorised payment can be captured; ${paymentId} is ${payment.status}`)
    }
    const before = payment.status
    const result = await this.capturePayment(payment, actor, note)
    await this.recordStatusChange(result, before, `Capture retried for ${result.purchase_ref}`, note, actor)
    return result
  }

  /**
   * Releases an authorisation without charging. Feature 3b calls this when it cancels a booking, and staff call it
   * when they cancel a capture-stalled purchase.
   */
  async voidPayment(paymentId: string, reason: string, actor?: string | null): Promise<PaymentRecord> {
    const payment = this.requirePayment(paymentId)
    if (payment.status === 'voided' || payment.status === 'expired') return payment
    if (payment.status !== 'authorised') {
      throw new ConflictException(`Only an authorised payment can be voided; ${paymentId} is ${payment.status}`)
    }
    const now = this.clock.now()
    const before = payment.status
    payment.status = 'voided'
    payment.voided_at = now
    payment.last_error = reason
    payment.updated_at = now
    this.closeException(payment, 'voided', actor, reason)
    const updated = this.repo.update(payment)
    await this.recordStatusChange(updated, before, `Payment ${payment.purchase_ref} voided`, reason, actor)
    return updated
  }

  /**
   * Ends a payment whose deadline has passed.
   *
   * Before the authorisation there is nothing to release, so the payment goes to `expired` — the frame's "your
   * 15-minute seat hold ran out" state. After the authorisation the card has to be released, so the payment is
   * `voided` and the customer was never charged.
   */
  async expireIfPastDeadline(paymentId: string): Promise<PaymentRecord> {
    const payment = this.requirePayment(paymentId)
    const now = this.clock.now()
    if (now <= payment.expires_at) return payment

    if (payment.status === 'created') {
      payment.status = 'expired'
      payment.last_error = 'hold_expired'
      payment.updated_at = now
      this.closeException(payment, 'expired')
      return this.repo.update(payment)
    }
    if (payment.status === 'authorised') {
      payment.status = 'voided'
      payment.voided_at = now
      payment.last_error = 'hold_expired'
      payment.updated_at = now
      this.closeException(payment, 'voided', null, 'The booking hold expired before the capture.')
      return this.repo.update(payment)
    }
    return payment
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  The HTTP surface                                                           */
  /* ──────────────────────────────────────────────────────────────────────────── */

  /** The payment status a selling feature's confirmation page polls. */
  getPaymentStatus(userId: string, paymentId: string): PaymentStatusDto {
    const payment = this.requirePayment(paymentId)
    // A payment with no payer (an onboard sale) can be read by whoever holds the link; one with a payer can only be
    // read by that payer. TODO(F5a): the real check is "the signed-in customer owns this payment".
    if (payment.payer_customer_id && payment.payer_customer_id !== resolveCustomerId(userId)) {
      throw new NotFoundException(`Payment ${paymentId} not found`)
    }
    return {
      id: payment.id,
      status: payment.status,
      state: toCustomerState(payment),
      amount_total: payment.amount_total,
      voucher_amount: payment.voucher_amount,
      card_amount: payment.card_amount,
      currency: payment.currency,
      capture_stalled: payment.capture_stalled_at !== null,
      receipt_id: this.repo.findReceiptByPaymentId(payment.id)?.id ?? null,
      updated_at: payment.updated_at.toISOString(),
    }
  }

  /** The signed-in customer's receipts, newest first. */
  listCustomerReceipts(userId: string, query: ReceiptQueryDto): ListDto<ReceiptSummaryDto> {
    const customerId = resolveCustomerId(userId)
    const limit = query.limit ?? DEFAULT_LIMIT
    const rows = this.repo
      .listReceipts()
      .filter((receipt) => receipt.refund_id === null && receipt.document_type !== 'credit_note')
      .map((receipt) => ({ receipt, payment: this.repo.findById(receipt.payment_id) }))
      .filter((row): row is { receipt: ReceiptRecord; payment: PaymentRecord } => row.payment !== undefined)
      .filter((row) => row.payment.payer_customer_id === customerId)
      .sort((a, b) => b.receipt.issued_at.getTime() - a.receipt.issued_at.getTime())

    const items = rows.slice(0, limit).map((row) => this.toReceiptSummary(row.receipt, row.payment))
    return { items, total: rows.length }
  }

  /** One of the signed-in customer's receipts. 404 when the receipt is not theirs. */
  getCustomerReceipt(userId: string, receiptId: string): ReceiptDetailDto {
    const customerId = resolveCustomerId(userId)
    const receipt = this.repo.findReceiptById(receiptId)
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`)
    const payment = this.repo.findById(receipt.payment_id)
    if (!payment) throw new NotFoundException(`Receipt ${receiptId} has no payment`)
    if (payment.payer_customer_id !== customerId) throw new NotFoundException(`Receipt ${receiptId} not found`)

    const attempt = payment.attempts[payment.attempts.length - 1]
    const creditNote = this.repo.findCreditNoteByPaymentId(payment.id)
    return {
      ...this.toReceiptSummary(receipt, payment),
      billing_name: receipt.billing_name,
      card_brand: attempt?.card_brand ?? null,
      card_last4: attempt?.card_last4 ?? null,
      lines: payment.lines.map((line) => this.toLineDto(line)),
      credit_note: creditNote
        ? {
            document_number: creditNote.document_number,
            amount: creditNote.amount,
            issued_at: creditNote.issued_at.toISOString(),
          }
        : null,
    }
  }

  /** The staff payment lookup, with the frames' status filters. */
  listStaffPayments(query: StaffPaymentQueryDto): ListDto<StaffPaymentSummaryDto> {
    const limit = query.limit ?? DEFAULT_LIMIT
    const rows = this.repo
      .listPayments()
      .filter((payment) => query.status === undefined || matchesStaffFilter(payment, query.status))
      .filter((payment) => query.source_feature === undefined || payment.source_feature === query.source_feature)
      .sort((a, b) => b.started_at.getTime() - a.started_at.getTime())

    const items = rows.slice(0, limit).map((payment) => this.toStaffPaymentSummary(payment))
    return { items, total: rows.length }
  }

  /** One payment, with the capture-stalled panel the staff frames show. */
  getStaffPayment(paymentId: string): StaffPaymentDetailDto {
    const payment = this.requirePayment(paymentId)
    const exception = this.repo.findException(payment.id)
    return {
      ...this.toStaffPaymentSummary(payment),
      idempotency_key: payment.idempotency_key,
      provider: payment.provider,
      provider_fee: payment.provider_fee,
      capture_attempts: payment.capture_attempts,
      authorised_at: payment.authorised_at?.toISOString() ?? null,
      voided_at: payment.voided_at?.toISOString() ?? null,
      lines: payment.lines.map((line) => this.toLineDto(line)),
      exception: exception
        ? {
            state: exception.state,
            detected_at: exception.detected_at.toISOString(),
            resolved_at: exception.resolved_at?.toISOString() ?? null,
            resolved_by: exception.resolved_by,
            resolution: exception.resolution,
            note: exception.note,
          }
        : null,
    }
  }

  /**
   * The staff exception list.
   *
   * - `needs_action` — the payment needs a decision now: the capture stalled, or the deadline passed while it was open.
   * - `queued` — the payment is in flight and still inside its deadline.
   * - `resolved` — the payment was on the list and has since been closed.
   * - `all` — every one of those.
   */
  listPaymentExceptions(tab: PaymentExceptionTab): ListDto<StaffPaymentSummaryDto> {
    const now = this.clock.now()
    const rows = this.repo
      .listPayments()
      .map((payment) => ({ payment, state: this.exceptionStateFor(payment, now) }))
      .filter((row): row is { payment: PaymentRecord; state: PaymentExceptionState } => row.state !== null)
      .filter((row) => tab === 'all' || row.state === tab)
      .sort((a, b) => b.payment.started_at.getTime() - a.payment.started_at.getTime())

    const items = rows.map((row) => this.toStaffPaymentSummary(row.payment))
    return { items, total: items.length }
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Internals                                                                  */
  /* ──────────────────────────────────────────────────────────────────────────── */

  private requirePayment(paymentId: string): PaymentRecord {
    const payment = this.repo.findById(paymentId)
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`)
    return payment
  }

  /**
   * Writes the `status_change` row for a staff action.
   *
   * The row goes through `tryWrite`, so a failure never changes the outcome of the action itself: the payment has
   * already moved, and losing the audit row is bad but losing the capture is worse.
   *
   * TODO(F5a): the real implementation writes this row in the same transaction as the payment update, so the status
   * change and its audit row commit together or not at all.
   */
  private async recordStatusChange(
    payment: PaymentRecord,
    before: PaymentStatus,
    summary: string,
    reason: string | null,
    actorId: string | null,
  ): Promise<void> {
    if (!actorId) return
    const actor = await this.audit.resolveActor(actorId).catch(() => AuditService.systemActor())
    await this.audit.tryWrite({
      actor,
      sourceFeature: '5',
      action: 'status_change',
      entityType: 'payment',
      entityId: payment.id,
      summary,
      reason,
      before: { status: before },
      after: { status: payment.status },
    })
  }

  private async capturePayment(payment: PaymentRecord, actor?: string | null, note?: string | null): Promise<PaymentRecord> {
    const now = this.clock.now()
    const attempt = payment.attempts.find((a) => a.status === 'authorised') ?? payment.attempts[payment.attempts.length - 1]
    const result = await this.gateway.capture({
      payment_id: payment.id,
      provider_session_id: attempt?.provider_session_id ?? '',
      amount: payment.card_amount,
      currency: payment.currency,
    })

    payment.capture_attempts += 1
    payment.updated_at = now

    if (!result.ok) {
      payment.last_error = result.failure_code ?? 'capture_failed'
      if (payment.capture_attempts >= CAPTURE_RETRY_LIMIT) {
        payment.capture_stalled_at = now
        this.openException(payment, `Capture failed ${payment.capture_attempts} times: ${payment.last_error}`)
      }
      return this.repo.update(payment)
    }

    payment.status = 'captured'
    payment.captured_at = now
    payment.provider_fee = result.provider_fee ?? null
    payment.last_error = null
    payment.capture_stalled_at = null
    this.issueReceipt(payment)
    this.closeException(payment, 'captured', actor, note ?? undefined)
    return this.repo.update(payment)
  }

  /** Issues the receipt for a captured payment. One receipt per payment, as the schema's partial unique index says. */
  private issueReceipt(payment: PaymentRecord): ReceiptRecord {
    const existing = this.repo.findReceiptByPaymentId(payment.id)
    if (existing) return existing

    const now = this.clock.now()
    const receipt: ReceiptRecord = {
      id: randomUUID(),
      payment_id: payment.id,
      refund_id: null,
      document_type: payment.source_feature === 17 ? 'invoice' : 'receipt',
      document_number: `${payment.source_feature === 17 ? 'INV' : 'RCPT'}-${payment.id.slice(-6).toUpperCase()}`,
      amount: payment.amount_total,
      billing_name: customerName(payment.payer_customer_id),
      issued_at: now,
      created_at: now,
    }
    return this.repo.insertReceipt(receipt)
  }

  private buildAttempt(payment: PaymentRecord, result: Awaited<ReturnType<PaymentGateway['authorise']>>): PaymentAttemptRecord {
    const now = this.clock.now()
    return {
      id: randomUUID(),
      payment_id: payment.id,
      provider_session_id: result.provider_session_id ?? `cs_failed_${payment.id.slice(-6)}`,
      provider_intent_id: result.provider_intent_id ?? null,
      status: result.ok ? 'authorised' : 'failed',
      failure_code: result.failure_code ?? null,
      card_brand: result.card_brand ?? null,
      card_last4: result.card_last4 ?? null,
      created_at: now,
      updated_at: now,
    }
  }

  /** Flags a payment for staff. The list has no table of its own yet, so the row lives in the mock repository. */
  private openException(payment: PaymentRecord, note: string): void {
    const existing = this.repo.findException(payment.id)
    this.repo.saveException({
      payment_id: payment.id,
      state: 'needs_action',
      detected_at: existing?.detected_at ?? this.clock.now(),
      resolved_at: null,
      resolved_by: null,
      resolution: null,
      note,
    })
  }

  private closeException(payment: PaymentRecord, resolution: PaymentExceptionResolution, actor?: string | null, note?: string): void {
    const existing = this.repo.findException(payment.id)
    const now = this.clock.now()
    this.repo.saveException({
      payment_id: payment.id,
      state: 'resolved',
      detected_at: existing?.detected_at ?? now,
      resolved_at: now,
      resolved_by: actor ?? null,
      resolution,
      note: note ?? existing?.note ?? null,
    })
  }

  /**
   * Where a payment sits on the exception list.
   *
   * A resolved exception keeps its row, so the payment stays on the "resolved" tab. A payment that was never flagged
   * is only on the list while it is open — a settled payment is not an exception, however long ago its deadline was.
   */
  private exceptionStateFor(payment: PaymentRecord, now: Date): PaymentExceptionState | null {
    const exception = this.repo.findException(payment.id)
    if (exception?.state === 'resolved') return 'resolved'
    const stillOpen = payment.status === 'created' || payment.status === 'authorised'
    if (!stillOpen) return null
    if (payment.capture_stalled_at !== null || now > payment.expires_at) return 'needs_action'
    return 'queued'
  }

  private toLineDto(line: PaymentLineRecord): PaymentLineDto {
    return { line_type: line.line_type, description: line.description, amount: line.amount }
  }

  private toReceiptSummary(receipt: ReceiptRecord, payment: PaymentRecord): ReceiptSummaryDto {
    return {
      id: receipt.id,
      document_number: receipt.document_number,
      document_type: receipt.document_type,
      payment_id: payment.id,
      source_feature: payment.source_feature,
      source_feature_label: SOURCE_FEATURE_LABELS[payment.source_feature],
      status: payment.status,
      title: this.receiptTitle(payment),
      amount: receipt.amount,
      voucher_amount: payment.voucher_amount,
      card_amount: payment.card_amount,
      currency: payment.currency,
      issued_at: receipt.issued_at.toISOString(),
      booking_reference: this.bookingReference(payment),
      refund_state: this.refundStateFor(payment),
      has_credit_note: this.repo.findCreditNoteByPaymentId(payment.id) !== undefined,
      miles_redeemed: this.milesRedeemed(payment),
    }
  }

  private toStaffPaymentSummary(payment: PaymentRecord): StaffPaymentSummaryDto {
    return {
      id: payment.id,
      purchase_ref: payment.purchase_ref,
      source_feature: payment.source_feature,
      source_feature_label: SOURCE_FEATURE_LABELS[payment.source_feature],
      status: payment.status,
      status_label: STATUS_LABELS[payment.status],
      payer_customer_id: payment.payer_customer_id,
      customer_name: customerName(payment.payer_customer_id),
      amount_total: payment.amount_total,
      voucher_amount: payment.voucher_amount,
      card_amount: payment.card_amount,
      currency: payment.currency,
      started_at: payment.started_at.toISOString(),
      expires_at: payment.expires_at.toISOString(),
      captured_at: payment.captured_at?.toISOString() ?? null,
      capture_stalled_at: payment.capture_stalled_at?.toISOString() ?? null,
      last_error: payment.last_error,
      receipt_id: this.repo.findReceiptByPaymentId(payment.id)?.id ?? null,
    }
  }

  private bookingReference(payment: PaymentRecord): string | null {
    if (payment.booking_id) return MOCK_BOOKING_REFERENCE[payment.booking_id] ?? null
    if (payment.cargo_booking_id) return MOCK_CARGO_REFERENCE[payment.cargo_booking_id] ?? null
    return null
  }

  private receiptTitle(payment: PaymentRecord): string {
    const label = SOURCE_FEATURE_LABELS[payment.source_feature]
    const reference = this.bookingReference(payment)
    return reference ? `${label} · ${reference}` : label
  }

  /**
   * The miles a booking was redeemed with.
   *
   * Miles are not money: they live on Feature 11's redeem rows, not on the payment, so the receipt carries them as
   * their own number next to the cash that was charged.
   *
   * TODO(F5a): read these from Feature 11's redeem rows instead of the mock map.
   */
  private milesRedeemed(payment: PaymentRecord): number | null {
    if (!payment.booking_id) return null
    return MOCK_MILES_REDEEMED[payment.booking_id] ?? null
  }

  /**
   * Whether the customer can ask for a refund, and whether a staff member has to decide.
   *
   * TODO(F5a): the refundable state is the booking's, and the "flown" state is the flight's — both belong to Feature
   * 3b. The mock keeps them in `mock-booking-state.ts`.
   */
  private refundStateFor(payment: PaymentRecord): RefundState {
    if (payment.status === 'reversed') return 'not_refundable'
    if (!payment.booking_id) return 'ask_staff'
    return MOCK_BOOKING_REFUND_STATE[payment.booking_id] ?? 'ask_staff'
  }
}
