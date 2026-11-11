import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { PAYMENT_REPOSITORY, type PaymentRepository } from './payment.repository'
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment.gateway'
import {
  matchesStaffFilter,
  paymentReference,
  RECEIPT_FILTERS,
  SOURCE_FEATURE_LABELS,
  STAFF_PAYMENT_FILTERS,
  stateHistoryFor,
  STATUS_LABELS,
  toCustomerState,
} from './payment-status'
import type { ReceiptFilter } from './payment-status'
import {
  bookingFlight,
  customerEmail,
  customerName,
  MOCK_BOOKING_FLOWN,
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
  PaymentLineDto,
  PaymentProblemDto,
  PaymentProblemListDto,
  PaymentStatusDto,
  ReceiptDetailDto,
  ReceiptListDto,
  ReceiptStatus,
  ReceiptSummaryDto,
  RefundState,
  StaffPaymentDetailDto,
  StaffPaymentListDto,
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

/** How many rows the staff lookup shows on a page, as the frames show. */
const DEFAULT_PAGE_SIZE = 10

/**
 * How long a payment may sit without a provider event before the staff list calls it a problem.
 *
 * The frames say 30 minutes.
 */
const PROVIDER_EVENT_TIMEOUT_MS = 30 * 60 * 1000

/** Money is a JS number rounded to two decimals in the mock; the real implementation uses Prisma `Decimal`. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** `40000` → `40,000`, the way the frames write miles. */
function formatMiles(miles: number): string {
  return new Intl.NumberFormat('en-US').format(miles)
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
  private readonly logger = new Logger(PaymentsCheckoutService.name)

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

    const replay = await this.repo.findByIdempotencyKey(input.payer_customer_id, input.idempotency_key)
    if (replay) return replay

    const live = await this.repo.findLiveByPurchaseRef(input.source_feature, input.purchase_ref)
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
      confirmed_at: null,
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
    const payment = await this.requirePayment(paymentId)
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
      payment.confirmed_at = now
      payment.captured_at = now
      payment.updated_at = now
      await this.issueReceipt(payment)
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
    await this.repo.update(payment)

    const confirmed = await confirm()
    if (!confirmed) {
      return this.voidPayment(payment.id, 'seller_declined')
    }
    payment.confirmed_at = this.clock.now()
    return this.capturePayment(payment)
  }

  /**
   * Captures an authorised payment. Staff call this to retry a capture that stalled, from the exception list.
   *
   * The payment stays `authorised` when the capture fails. Once it has failed `capture_retry_limit` times the payment
   * is capture-stalled: it stays `authorised`, gets a `capture_stalled_at`, and lands on the staff exception list.
   */
  async retryCapture(paymentId: string, actor?: string | null, note?: string | null): Promise<PaymentRecord> {
    const payment = await this.requirePayment(paymentId)
    if (payment.status !== 'authorised') {
      throw new ConflictException(`Only an authorised payment can be captured; ${paymentId} is ${payment.status}`)
    }
    const before = payment.status
    const result = await this.capturePayment(payment, actor, note)
    await this.recordStatusChange(result, before, `Capture retried for ${result.purchase_ref}`, note, actor)
    return result
  }

  /**
   * Releases an authorisation without charging.
   *
   * Feature 3b calls this in process when it cancels a booking. The staff screens do not offer it: the frames say
   * staff cannot edit a payment's state by hand, and the "authorisation voided" problem is one the system reaches on
   * its own.
   */
  async voidPayment(paymentId: string, reason: string, actor?: string | null): Promise<PaymentRecord> {
    const payment = await this.requirePayment(paymentId)
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
    await this.closeException(payment, 'voided', actor, reason)
    const updated = await this.repo.update(payment)
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
    const payment = await this.requirePayment(paymentId)
    const now = this.clock.now()
    if (now <= payment.expires_at) return payment

    if (payment.status === 'created') {
      payment.status = 'expired'
      payment.last_error = 'hold_expired'
      payment.updated_at = now
      await this.closeException(payment, 'expired')
      return this.repo.update(payment)
    }
    if (payment.status === 'authorised') {
      payment.status = 'voided'
      payment.voided_at = now
      payment.last_error = 'hold_expired'
      await this.closeException(payment, 'voided', null, 'The booking hold expired before the capture.')
      return this.repo.update(payment)
    }
    return payment
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  The HTTP surface                                                           */
  /* ──────────────────────────────────────────────────────────────────────────── */

  /** The payment status a selling feature's confirmation page polls. */
  async getPaymentStatus(userId: string, paymentId: string): Promise<PaymentStatusDto> {
    const payment = await this.requirePayment(paymentId)
    // A payment with no payer (an onboard sale) can be read by whoever holds the link; one with a payer can only be
    // read by that payer. TODO(F5a): the real check is "the signed-in customer owns this payment".
    if (payment.payer_customer_id && payment.payer_customer_id !== resolveCustomerId(userId)) {
      throw new NotFoundException(`Payment ${paymentId} not found`)
    }
    const receipt = await this.repo.findReceiptByPaymentId(payment.id)
    return {
      id: payment.id,
      status: payment.status,
      state: toCustomerState(payment),
      amount_total: payment.amount_total,
      voucher_amount: payment.voucher_amount,
      card_amount: payment.card_amount,
      currency: payment.currency,
      capture_stalled: payment.capture_stalled_at !== null,
      expires_at: payment.expires_at.toISOString(),
      receipt_id: receipt?.id ?? null,
      updated_at: payment.updated_at.toISOString(),
    }
  }

  /** The signed-in customer's receipts, newest first. */
  async listCustomerReceipts(userId: string, query: ReceiptQueryDto): Promise<ReceiptListDto> {
    const customerId = resolveCustomerId(userId)
    const limit = query.limit ?? DEFAULT_LIMIT
    const receipts = await this.repo.listReceipts()
    const payments = await this.repo.listPayments()
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]))

    const rows = receipts
      .filter((receipt) => receipt.refund_id === null && receipt.document_type !== 'credit_note')
      .map((receipt) => ({ receipt, payment: paymentById.get(receipt.payment_id) }))
      .filter((row): row is { receipt: ReceiptRecord; payment: PaymentRecord } => row.payment !== undefined)
      .filter((row) => row.payment.payer_customer_id === customerId)
      .sort((a, b) => b.receipt.issued_at.getTime() - a.receipt.issued_at.getTime())

    const summaries = await Promise.all(rows.map((row) => this.toReceiptSummary(row.receipt, row.payment)))

    const counts = this.countReceipts(summaries)
    const searched = summaries.filter((summary) => this.matchesReceiptSearch(summary, query.search))
    const filtered = searched.filter((summary) => query.filter === undefined || this.matchesReceiptFilter(summary, query.filter))

    return { items: filtered.slice(0, limit), total: filtered.length, counts }
  }

  /** One of the signed-in customer's receipts. 404 when the receipt is not theirs. */
  async getCustomerReceipt(userId: string, receiptId: string): Promise<ReceiptDetailDto> {
    const customerId = resolveCustomerId(userId)
    const receipt = await this.repo.findReceiptById(receiptId)
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`)
    const payment = await this.repo.findById(receipt.payment_id)
    if (!payment) throw new NotFoundException(`Receipt ${receiptId} has no payment`)
    if (payment.payer_customer_id !== customerId) throw new NotFoundException(`Receipt ${receiptId} not found`)

    const attempt = payment.attempts[payment.attempts.length - 1]
    const creditNote = await this.repo.findCreditNoteByPaymentId(payment.id)
    return {
      ...(await this.toReceiptSummary(receipt, payment)),
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

  /** The staff payment lookup, with the frames' status filters, search box and filter counts. */
  async listStaffPayments(query: StaffPaymentQueryDto): Promise<StaffPaymentListDto> {
    const payments = await this.repo.listPayments()
    const searched = payments.filter((payment) => this.matchesPaymentSearch(payment, query.search))

    const counts: Record<'all' | StaffPaymentFilterKey, number> = {
      all: searched.length,
      captured: 0,
      failed: 0,
      capture_stalled: 0,
      voided: 0,
      refunded: 0,
    }
    for (const payment of searched) {
      for (const filter of STAFF_PAYMENT_FILTERS) {
        if (matchesStaffFilter(payment, filter)) counts[filter] += 1
      }
    }

    const filtered = searched
      .filter((payment) => query.status === undefined || matchesStaffFilter(payment, query.status))
      .filter((payment) => query.source_feature === undefined || payment.source_feature === query.source_feature)
      .sort((a, b) => b.started_at.getTime() - a.started_at.getTime())

    const pageSize = query.limit ?? DEFAULT_PAGE_SIZE
    const page = query.page ?? 1
    const items = await Promise.all(
      filtered.slice((page - 1) * pageSize, page * pageSize).map((payment) => this.toStaffPaymentSummary(payment)),
    )
    return { items, total: filtered.length, counts }
  }

  /**
   * One payment, with the capture-stalled panel and the state history the frames show.
   *
   * `actorId` is the staff member who opened it. A payment record carries a customer's name, email and the last four
   * digits of their card, so opening one is written to `audit_log` as `view_sensitive`.
   *
   * The action endpoints read the payment back after a change; they call this without an actor, so a retry is not
   * counted as a view on top of the status change it already recorded.
   */
  async getStaffPayment(paymentId: string, actorId?: string | null): Promise<StaffPaymentDetailDto> {
    const payment = await this.requirePayment(paymentId)
    if (actorId) {
      await this.recordPaymentView(payment, actorId)
    }
    return this.toStaffPaymentDetail(payment)
  }

  /**
   * The staff exception list — a list of *problems*, as the frames show it.
   *
   * Each row says what went wrong, which reference it belongs to, when it started and what a staff member can do about
   * it. A payment that is simply in flight is not a problem, so it is not on this list.
   *
   * - `needs_action` — a person has to decide now.
   * - `queued` — a job or a retry is already running; nothing to do yet.
   * - `resolved` — it is closed, and stays on the record.
   * - `all` — every one of those.
   */
  async listPaymentProblems(tab: PaymentExceptionTab): Promise<PaymentProblemListDto> {
    const now = this.clock.now()
    const payments = await this.repo.listPayments()
    const rows: PaymentProblemDto[] = []
    for (const payment of payments) {
      const problem = await this.problemFor(payment, now)
      if (problem) rows.push(problem)
    }

    const counts: Record<PaymentExceptionState | 'all', number> = { all: rows.length, needs_action: 0, queued: 0, resolved: 0 }
    for (const row of rows) counts[row.state] += 1

    const filtered = rows.filter((row) => tab === 'all' || row.state === tab).sort((a, b) => Date.parse(b.since) - Date.parse(a.since))

    return { items: filtered, total: filtered.length, counts }
  }

  /**
   * Sends a payment to the finance ledger, for a payment whose posting did not go through.
   *
   * The frames' button is "Send now". In the mock the ledger answers straight away, so the problem is closed; the real
   * implementation moves the row to "Queued" until the ledger answers.
   *
   * The note the staff member typed is kept on the exception row and on the audit trail.
   */
  async sendFinancePosting(paymentId: string, actor?: string | null, note?: string | null): Promise<PaymentRecord> {
    const payment = await this.requirePayment(paymentId)
    if (payment.last_error !== 'finance_posting_failed') {
      throw new ConflictException(`Payment ${paymentId} is not waiting on the finance ledger`)
    }
    const now = this.clock.now()
    payment.last_error = null
    payment.updated_at = now
    await this.repo.saveException({
      payment_id: payment.id,
      state: 'resolved',
      detected_at: now,
      resolved_at: now,
      resolved_by: actor ?? null,
      resolution: 'posted',
      note: note ?? 'The payment was sent to the finance ledger.',
    })
    await this.recordStatusChange(payment, 'captured', `Payment ${payment.purchase_ref} posted to the finance ledger`, note ?? null, actor)
    return this.repo.update(payment)
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Internals                                                                  */
  /* ──────────────────────────────────────────────────────────────────────────── */

  private async requirePayment(paymentId: string): Promise<PaymentRecord> {
    const payment = (await this.repo.findById(paymentId)) ?? (await this.findPaymentByReference(paymentId))
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`)
    return payment
  }

  /**
   * Finds a payment by the reference the staff read out loud, e.g. `PAY-20261104-0042`.
   *
   * The reference is derived rather than stored, so the mock looks a payment up the same way it builds the reference.
   * It lets the staff screens link to a payment by the number on the screen instead of by its internal id.
   */
  private async findPaymentByReference(reference: string): Promise<PaymentRecord | undefined> {
    const needle = reference.trim().toUpperCase()
    if (!needle.startsWith('PAY-')) return undefined
    const payments = await this.repo.listPayments()
    return payments.find((payment) => paymentReference(payment) === needle)
  }

  /** The staff detail page's body: the summary plus everything only the detail page shows. */
  private async toStaffPaymentDetail(payment: PaymentRecord): Promise<StaffPaymentDetailDto> {
    const exception = await this.repo.findException(payment.id)
    return {
      ...(await this.toStaffPaymentSummary(payment)),
      idempotency_key: payment.idempotency_key,
      provider: payment.provider,
      provider_fee: payment.provider_fee,
      capture_attempts: payment.capture_attempts,
      authorised_at: payment.authorised_at?.toISOString() ?? null,
      voided_at: payment.voided_at?.toISOString() ?? null,
      lines: payment.lines.map((line) => this.toLineDto(line)),
      state_history: stateHistoryFor(payment).map((step) => ({
        key: step.key,
        label: step.label,
        at: step.at?.toISOString() ?? null,
      })),
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
   * Writes the `view_sensitive` row for a staff member opening a payment.
   *
   * The row carries no before/after, so it is not itself a sensitive row. A failure is only logged: refusing to show
   * a payment because the audit table was briefly unavailable would be worse than the missing row.
   *
   * TODO(F5a): the real implementation writes this row in the same transaction as the read, so the view and its row
   * commit together.
   */
  private async recordPaymentView(payment: PaymentRecord, actorId: string): Promise<void> {
    try {
      const actor = await this.audit.resolveActor(actorId).catch(() => AuditService.systemActor())
      await this.audit.recordSensitiveView(actor, {
        sourceFeature: '5',
        entityType: 'payment',
        entityId: payment.id,
        summary: `Opened payment ${paymentReference(payment)}`,
        reason: 'A staff member opened the payment record from the payment lookup.',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Audit view_sensitive write failed (payment ${payment.id}): ${message}`)
    }
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
    reason: string | null | undefined,
    actorId: string | null | undefined,
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
        await this.openException(payment, `Capture failed ${payment.capture_attempts} times: ${payment.last_error}`)
      }
      return this.repo.update(payment)
    }

    payment.status = 'captured'
    payment.captured_at = now
    payment.provider_fee = result.provider_fee ?? null
    payment.last_error = null
    payment.capture_stalled_at = null
    await this.issueReceipt(payment)
    await this.closeException(payment, 'captured', actor, note ?? undefined)
    return this.repo.update(payment)
  }

  /** Issues the receipt for a captured payment. One receipt per payment, as the schema's partial unique index says. */
  private async issueReceipt(payment: PaymentRecord): Promise<ReceiptRecord> {
    const existing = await this.repo.findReceiptByPaymentId(payment.id)
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
  private async openException(payment: PaymentRecord, note: string): Promise<void> {
    const existing = await this.repo.findException(payment.id)
    await this.repo.saveException({
      payment_id: payment.id,
      state: 'needs_action',
      detected_at: existing?.detected_at ?? this.clock.now(),
      resolved_at: null,
      resolved_by: null,
      resolution: null,
      note,
    })
  }

  private async closeException(
    payment: PaymentRecord,
    resolution: PaymentExceptionResolution,
    actor?: string | null,
    note?: string,
  ): Promise<void> {
    const existing = await this.repo.findException(payment.id)
    const now = this.clock.now()
    await this.repo.saveException({
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
   * The problem a payment is, if it is one.
   *
   * A payment that is simply in flight is not a problem: it is not on the list. The frames' problems are a capture
   * that stopped, a provider event that never arrived, a posting the ledger did not accept, and an authorisation the
   * system released on its own.
   */
  private async problemFor(payment: PaymentRecord, now: Date): Promise<PaymentProblemDto | null> {
    const exception = await this.repo.findException(payment.id)
    const reference = paymentReference(payment)
    const bookingReference = this.bookingReference(payment)

    if (payment.capture_stalled_at) {
      const cargo = payment.source_feature === 17
      return {
        id: payment.id,
        type: cargo ? 'cargo_capture_stalled' : 'ticket_capture_stalled',
        title: cargo ? 'Cargo capture stalled' : 'Ticket capture stalled',
        reference,
        booking_reference: bookingReference,
        what_happened: cargo
          ? 'The cargo booking is confirmed, but the card has not been charged. No Air Waybill is issued until it is.'
          : 'The booking is confirmed and the ticket is live, but the card has not been charged.',
        what_to_do: cargo
          ? 'Retry the capture. If it keeps failing, cancel the cargo booking.'
          : 'Retry the capture. If it keeps failing, decide whether to cancel the ticket.',
        action: 'retry_capture',
        action_label: 'Retry capture',
        since: payment.capture_stalled_at.toISOString(),
        state: 'needs_action',
        payment_id: payment.id,
      }
    }

    if (payment.last_error === 'finance_posting_failed') {
      return {
        id: payment.id,
        type: 'finance_posting_delayed',
        title: 'Finance posting delayed',
        reference,
        booking_reference: bookingReference,
        what_happened: 'The finance ledger did not answer (503). The payment itself is complete.',
        what_to_do: 'Send the payment to the finance ledger now.',
        action: 'send_posting',
        action_label: 'Send now',
        since: payment.updated_at.toISOString(),
        state: 'queued',
        payment_id: payment.id,
      }
    }

    if (exception?.resolution === 'posted') {
      return {
        id: payment.id,
        type: 'finance_posting_delayed',
        title: 'Finance posting delayed',
        reference,
        booking_reference: bookingReference,
        what_happened: 'The finance ledger did not answer (503). The payment itself is complete.',
        what_to_do: 'No action — the payment is in the ledger.',
        action: 'none',
        action_label: null,
        since: exception.detected_at.toISOString(),
        state: 'resolved',
        payment_id: payment.id,
      }
    }

    if (payment.status === 'voided' && payment.last_error === 'booking_confirm_failed') {
      return {
        id: payment.id,
        type: 'authorisation_voided',
        title: 'Authorisation voided',
        reference,
        booking_reference: bookingReference,
        what_happened: 'The card was authorised, but the booking confirm failed twice. The hold was released automatically.',
        what_to_do: 'No action — the customer was not charged.',
        action: 'none',
        action_label: null,
        since: (payment.voided_at ?? payment.updated_at).toISOString(),
        state: 'resolved',
        payment_id: payment.id,
      }
    }

    const waitingForProvider =
      payment.status === 'authorised' &&
      payment.capture_attempts === 0 &&
      now.getTime() - payment.started_at.getTime() > PROVIDER_EVENT_TIMEOUT_MS
    if (waitingForProvider) {
      return {
        id: payment.id,
        type: 'waiting_for_provider',
        title: 'Waiting for the provider',
        reference,
        booking_reference: bookingReference,
        what_happened: 'No provider event for 30 minutes.',
        what_to_do: 'Nothing yet — the reconciliation job is checking.',
        action: 'none',
        action_label: null,
        since: payment.started_at.toISOString(),
        state: 'queued',
        payment_id: payment.id,
      }
    }

    return null
  }

  private toLineDto(line: PaymentLineRecord): PaymentLineDto {
    return { line_type: line.line_type, description: line.description, amount: line.amount }
  }

  private async toReceiptSummary(receipt: ReceiptRecord, payment: PaymentRecord): Promise<ReceiptSummaryDto> {
    const creditNote = await this.repo.findCreditNoteByPaymentId(payment.id)
    const flight = bookingFlight(payment.booking_id)
    const miles = this.milesRedeemed(payment)
    return {
      id: receipt.id,
      document_number: receipt.document_number,
      document_type: receipt.document_type,
      payment_id: payment.id,
      source_feature: payment.source_feature,
      source_feature_label: SOURCE_FEATURE_LABELS[payment.source_feature],
      status: payment.status,
      receipt_status: this.receiptStatusFor(payment, miles),
      title: this.receiptTitle(payment),
      amount: receipt.amount,
      voucher_amount: payment.voucher_amount,
      card_amount: payment.card_amount,
      currency: payment.currency,
      issued_at: receipt.issued_at.toISOString(),
      booking_reference: this.bookingReference(payment),
      route: flight?.route ?? null,
      flight_number: flight?.flight_number ?? null,
      flight_date: flight?.flight_date ?? null,
      refund_state: this.refundStateFor(payment),
      has_credit_note: creditNote !== undefined,
      miles_redeemed: miles,
      paid_with: this.paidWith(payment, miles, true),
    }
  }

  private async toStaffPaymentSummary(payment: PaymentRecord): Promise<StaffPaymentSummaryDto> {
    const receipt = await this.repo.findReceiptByPaymentId(payment.id)
    const attempt = payment.attempts[payment.attempts.length - 1]
    const miles = this.milesRedeemed(payment)
    return {
      id: payment.id,
      reference: paymentReference(payment),
      purchase_ref: payment.purchase_ref,
      source_feature: payment.source_feature,
      source_feature_label: SOURCE_FEATURE_LABELS[payment.source_feature],
      status: payment.status,
      status_label: STATUS_LABELS[payment.status],
      payer_customer_id: payment.payer_customer_id,
      customer_name: customerName(payment.payer_customer_id),
      customer_email: customerEmail(payment.payer_customer_id),
      booking_reference: this.bookingReference(payment),
      paid_with: this.paidWith(payment, miles),
      card_brand: attempt?.card_brand ?? null,
      card_last4: attempt?.card_last4 ?? null,
      miles_redeemed: miles,
      amount_total: payment.amount_total,
      voucher_amount: payment.voucher_amount,
      card_amount: payment.card_amount,
      currency: payment.currency,
      started_at: payment.started_at.toISOString(),
      expires_at: payment.expires_at.toISOString(),
      captured_at: payment.captured_at?.toISOString() ?? null,
      capture_stalled_at: payment.capture_stalled_at?.toISOString() ?? null,
      last_error: payment.last_error,
      receipt_id: receipt?.id ?? null,
    }
  }

  /**
   * What the customer paid with, in the words the frames use.
   *
   * "Card ending 4242", "24,000 miles + card", "18,000 miles only". Miles are not money, so they sit next to the cash
   * rather than inside it.
   *
   * The customer's receipt spells the card out in full — "24,000 miles + card ending 4242" — while the staff lookup
   * keeps it short.
   */
  private paidWith(payment: PaymentRecord, miles: number | null, cardDigits = false): string {
    const ending = this.cardEnding(payment)
    const card = cardDigits ? (ending ? `card ending ${ending}` : 'card') : 'card'
    if (miles !== null && miles > 0 && payment.card_amount > 0) return `${formatMiles(miles)} miles + ${card}`
    if (miles !== null && miles > 0) return `${formatMiles(miles)} miles only`
    if (payment.voucher_amount > 0 && payment.card_amount === 0) return 'Voucher'
    if (ending) return `Card ending ${ending}`
    return '—'
  }

  /** The last four digits of the card the payment was made with, when the provider told us. */
  private cardEnding(payment: PaymentRecord): string | null {
    const attempt = payment.attempts[payment.attempts.length - 1]
    return attempt?.card_last4 ?? null
  }

  /**
   * The customer's word for a receipt's state, from the frames.
   *
   * The frames show three: "Paid", "Miles + cash" and "Flown". A receipt that was refunded in full still shows "Paid",
   * because a credit note is a separate document and the original receipt never changes.
   *
   * The flight's flown state and the miles both live outside the payment row — Feature 3b and Feature 11 own them — so
   * the mock reads them from its own maps.
   */
  private receiptStatusFor(payment: PaymentRecord, miles: number | null): ReceiptStatus {
    if (payment.booking_id && MOCK_BOOKING_FLOWN[payment.booking_id]) return 'flown'
    if (miles !== null && miles > 0 && payment.card_amount > 0) return 'miles_and_cash'
    return 'paid'
  }

  private countReceipts(summaries: ReceiptSummaryDto[]): Record<ReceiptFilter, number> {
    const counts = { all: summaries.length, flights: 0, miles_and_cash: 0, cargo: 0, credit_note: 0 }
    for (const filter of RECEIPT_FILTERS) {
      if (filter === 'all') continue
      counts[filter] = summaries.filter((summary) => this.matchesReceiptFilter(summary, filter)).length
    }
    return counts
  }

  /**
   * Whether a receipt belongs on a filter chip.
   *
   * The frames' chips cut across the status: "Flights" is every flight receipt, "Cargo" every cargo invoice, "Miles +
   * cash" the split ones, and "With credit note" the receipts a credit note is attached to.
   */
  private matchesReceiptFilter(summary: ReceiptSummaryDto, filter: ReceiptFilter): boolean {
    if (filter === 'all') return true
    if (filter === 'flights') return summary.source_feature === 3
    if (filter === 'cargo') return summary.source_feature === 17
    if (filter === 'credit_note') return summary.has_credit_note
    return summary.receipt_status === filter
  }

  /** The receipts search box takes a booking reference, a receipt number or a city. */
  private matchesReceiptSearch(summary: ReceiptSummaryDto, search: string | undefined): boolean {
    if (!search) return true
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return [summary.document_number, summary.booking_reference, summary.route, summary.title]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(needle))
  }

  /** The staff lookup's search box takes a reference, a booking, a customer or the last four digits of a card. */
  private matchesPaymentSearch(payment: PaymentRecord, search: string | undefined): boolean {
    if (!search) return true
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    const attempt = payment.attempts[payment.attempts.length - 1]
    return [
      paymentReference(payment),
      payment.purchase_ref,
      this.bookingReference(payment),
      customerName(payment.payer_customer_id),
      customerEmail(payment.payer_customer_id),
      attempt?.card_last4,
    ]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(needle))
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
   * A cargo invoice or an onboard order is not refundable by the customer — the money goes back through the seller.
   *
   * TODO(F5a): the refundable state is the booking's, and the "flown" state is the flight's — both belong to Feature
   * 3b. The mock keeps them in `mock-booking-state.ts`.
   */
  private refundStateFor(payment: PaymentRecord): RefundState {
    if (payment.status === 'reversed') return 'not_refundable'
    if (!payment.booking_id) return 'not_refundable'
    return MOCK_BOOKING_REFUND_STATE[payment.booking_id] ?? 'ask_staff'
  }
}

/** The staff lookup's filter keys, as the chips on the page. */
type StaffPaymentFilterKey = (typeof STAFF_PAYMENT_FILTERS)[number]
