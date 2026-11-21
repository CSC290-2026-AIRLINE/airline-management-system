import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { LIVE_STATUSES, type PaymentRepository } from './payment.repository'
import type {
  PaymentAttemptRecord,
  PaymentAttemptStatus,
  PaymentContext,
  PaymentExceptionRecord,
  PaymentLineRecord,
  PaymentLineType,
  PaymentProvider,
  PaymentRecord,
  PaymentSourceFeature,
  PaymentStatus,
  ReceiptDocumentType,
  ReceiptRecord,
} from './payment.types'

/** The most rows one list reads. The lookup and the receipts are short today; add a cursor before they are not. */
const LIST_LIMIT = 500

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const num = (value: { toString(): string }): number => Number(value.toString())

/** What a payment row needs from the rows around it. */
const PAYMENT_INCLUDE = {
  payment_line_payment_line_payment_idTopayment: { orderBy: { created_at: 'asc' } },
  payment_attempt: { orderBy: { created_at: 'asc' } },
  customer: { select: { user: { select: { email: true } }, passenger: { select: { first_name: true, last_name: true } } } },
  booking: { select: { booking_reference: true } },
  cargo_booking_payment_cargo_booking_idTocargo_booking: { select: { booking_ref: true } },
  refund: { orderBy: { requested_at: 'desc' }, take: 1, select: { id: true } },
} satisfies Prisma.paymentInclude
type PaymentRow = Prisma.paymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>

/** The statuses of a payment that the selling feature has already confirmed. A capture only follows a confirmation. */
const CONFIRMED_STATUSES: readonly string[] = ['captured', 'reversed']

/**
 * Feature 5a's storage, on the real tables: `payment`, `payment_line`, `payment_attempt` and `receipt`.
 *
 * It implements the same interface as `InMemoryPaymentRepository`, so the service does not know which one it has.
 * Writes that touch more than one table run in one transaction.
 *
 * Two things the schema has no home for, and what this class does about them:
 *
 * - **The staff exception rows.** Nothing records who resolved a stalled payment or when. The stall itself is real
 *   (`payment.capture_stalled_at`, `payment.last_error`), so the "needs action" list survives a restart; the closed
 *   ones are kept in memory and are lost when the process stops. TODO(F5a): ask the Database Team for an exception
 *   table, or read the resolution back from `audit_log`.
 * - **`confirmed_at`.** The booking owns the confirmation (Feature 3b). A captured or reversed payment was confirmed,
 *   so the history shows it at `authorised_at`.
 *
 * The booking, flight and miles lookups come from Features 3b and 11, which are not built yet. Where there is no
 * booking row, the reference the customer reads is the purchase reference, as in Feature 5b.
 */
@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  private readonly exceptions = new Map<string, PaymentExceptionRecord>()

  constructor(private readonly db: DbService) {}

  async insert(payment: PaymentRecord): Promise<PaymentRecord> {
    await this.db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          id: payment.id,
          source_feature: payment.source_feature,
          purchase_ref: payment.purchase_ref,
          payer_customer_id: payment.payer_customer_id,
          booking_id: payment.booking_id,
          cargo_booking_id: payment.cargo_booking_id,
          voucher_id: payment.voucher_id,
          idempotency_key: payment.idempotency_key,
          status: payment.status,
          provider: payment.provider,
          currency: payment.currency,
          amount_total: payment.amount_total,
          voucher_amount: payment.voucher_amount,
          card_amount: payment.card_amount,
          provider_fee: payment.provider_fee,
          capture_attempts: payment.capture_attempts,
          last_error: payment.last_error,
          started_at: payment.started_at,
          expires_at: payment.expires_at,
          authorised_at: payment.authorised_at,
          captured_at: payment.captured_at,
          voided_at: payment.voided_at,
          capture_stalled_at: payment.capture_stalled_at,
          created_at: payment.created_at,
          updated_at: payment.updated_at,
        },
      })
      if (payment.lines.length > 0) {
        await tx.payment_line.createMany({
          data: payment.lines.map((line) => ({
            ...(UUID.test(line.id) ? { id: line.id } : {}),
            payment_id: payment.id,
            booking_id: line.booking_id,
            booking_coupon_id: line.booking_coupon_id,
            line_type: line.line_type,
            source_ref: line.source_ref,
            description: line.description,
            amount: line.amount,
            refunded_amount: line.refunded_amount,
            created_at: line.created_at,
          })),
        })
      }
      for (const attempt of payment.attempts) await this.writeAttempt(tx, attempt)
    })
    return (await this.findById(payment.id)) ?? payment
  }

  async update(payment: PaymentRecord): Promise<PaymentRecord> {
    await this.db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: payment.status,
          provider: payment.provider,
          provider_fee: payment.provider_fee,
          capture_attempts: payment.capture_attempts,
          last_error: payment.last_error,
          authorised_at: payment.authorised_at,
          captured_at: payment.captured_at,
          voided_at: payment.voided_at,
          capture_stalled_at: payment.capture_stalled_at,
          updated_at: payment.updated_at,
        },
      })
      for (const attempt of payment.attempts) await this.writeAttempt(tx, attempt)
    })
    return (await this.findById(payment.id)) ?? payment
  }

  async findById(id: string): Promise<PaymentRecord | undefined> {
    if (!UUID.test(id)) return undefined
    const row = await this.db.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE })
    return row ? this.toPayment(row) : undefined
  }

  async findLiveByPurchaseRef(sourceFeature: PaymentSourceFeature, purchaseRef: string): Promise<PaymentRecord | undefined> {
    const row = await this.db.payment.findFirst({
      where: { source_feature: sourceFeature, purchase_ref: purchaseRef, status: { in: [...LIVE_STATUSES] } },
      include: PAYMENT_INCLUDE,
    })
    return row ? this.toPayment(row) : undefined
  }

  async findByIdempotencyKey(payerCustomerId: string | null, idempotencyKey: string): Promise<PaymentRecord | undefined> {
    const row = await this.db.payment.findFirst({
      where: { payer_customer_id: payerCustomerId, idempotency_key: idempotencyKey },
      include: PAYMENT_INCLUDE,
    })
    return row ? this.toPayment(row) : undefined
  }

  async listPayments(): Promise<PaymentRecord[]> {
    const rows = await this.db.payment.findMany({ orderBy: { started_at: 'desc' }, take: LIST_LIMIT, include: PAYMENT_INCLUDE })
    return rows.map((row) => this.toPayment(row))
  }

  async insertReceipt(receipt: ReceiptRecord): Promise<ReceiptRecord> {
    const row = await this.db.receipt.create({
      data: {
        ...(UUID.test(receipt.id) ? { id: receipt.id } : {}),
        payment_id: receipt.payment_id,
        refund_id: receipt.refund_id,
        document_type: receipt.document_type,
        document_number: receipt.document_number,
        amount: receipt.amount,
        billing_name: receipt.billing_name,
        issued_at: receipt.issued_at,
        created_at: receipt.created_at,
      },
    })
    return this.toReceipt(row)
  }

  async listReceipts(): Promise<ReceiptRecord[]> {
    const rows = await this.db.receipt.findMany({ orderBy: { issued_at: 'desc' }, take: LIST_LIMIT })
    return rows.map((row) => this.toReceipt(row))
  }

  async findReceiptById(id: string): Promise<ReceiptRecord | undefined> {
    if (!UUID.test(id)) return undefined
    const row = await this.db.receipt.findUnique({ where: { id } })
    return row ? this.toReceipt(row) : undefined
  }

  async findReceiptByPaymentId(paymentId: string): Promise<ReceiptRecord | undefined> {
    const row = await this.db.receipt.findFirst({ where: { payment_id: paymentId, refund_id: null } })
    return row ? this.toReceipt(row) : undefined
  }

  async findCreditNoteByPaymentId(paymentId: string): Promise<ReceiptRecord | undefined> {
    const row = await this.db.receipt.findFirst({ where: { payment_id: paymentId, document_type: 'credit_note' } })
    return row ? this.toReceipt(row) : undefined
  }

  async findCreditNoteByRefundId(refundId: string): Promise<ReceiptRecord | undefined> {
    if (!UUID.test(refundId)) return undefined
    const row = await this.db.receipt.findFirst({ where: { refund_id: refundId, document_type: 'credit_note' } })
    return row ? this.toReceipt(row) : undefined
  }

  findException(paymentId: string): Promise<PaymentExceptionRecord | undefined> {
    return Promise.resolve(this.exceptions.get(paymentId))
  }

  saveException(exception: PaymentExceptionRecord): Promise<PaymentExceptionRecord> {
    this.exceptions.set(exception.payment_id, exception)
    return Promise.resolve(exception)
  }

  listExceptions(): Promise<PaymentExceptionRecord[]> {
    return Promise.resolve([...this.exceptions.values()])
  }

  async resolveCustomerId(userId: string): Promise<string | undefined> {
    if (!UUID.test(userId)) return undefined
    const customer = await this.db.customer.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    return customer?.id
  }

  async recordProviderEvent(eventId: string, eventType: string, paymentId: string | null): Promise<boolean> {
    const existing = await this.db.payment_event_receipt.findUnique({ where: { provider_event_id: eventId } })
    if (existing) return existing.processed_at === null
    try {
      await this.db.payment_event_receipt.create({
        data: { provider_event_id: eventId, event_type: eventType, payment_id: paymentId && UUID.test(paymentId) ? paymentId : null },
      })
      return true
    } catch (error) {
      // A second delivery of the same event arrived while the first was being noted: the first one acts on it.
      if (error instanceof Error && 'code' in error && error.code === 'P2002') return false
      throw error
    }
  }

  async markProviderEventProcessed(eventId: string): Promise<void> {
    await this.db.payment_event_receipt.update({ where: { provider_event_id: eventId }, data: { processed_at: new Date() } })
  }

  /** One attempt, created the first time and updated after: the provider's session id is what is unique. */
  private async writeAttempt(tx: Prisma.TransactionClient, attempt: PaymentAttemptRecord): Promise<void> {
    const data = {
      provider_intent_id: attempt.provider_intent_id,
      status: attempt.status,
      failure_code: attempt.failure_code,
      card_brand: attempt.card_brand,
      card_last4: attempt.card_last4,
      updated_at: attempt.updated_at,
    }
    await tx.payment_attempt.upsert({
      where: { provider_session_id: attempt.provider_session_id },
      update: data,
      create: {
        ...(UUID.test(attempt.id) ? { id: attempt.id } : {}),
        payment_id: attempt.payment_id,
        provider_session_id: attempt.provider_session_id,
        created_at: attempt.created_at,
        ...data,
      },
    })
  }

  private toPayment(row: PaymentRow): PaymentRecord {
    const lines = row.payment_line_payment_line_payment_idTopayment.map((line): PaymentLineRecord => ({
      id: line.id,
      payment_id: line.payment_id,
      booking_id: line.booking_id,
      booking_coupon_id: line.booking_coupon_id,
      line_type: line.line_type as PaymentLineType,
      source_ref: line.source_ref,
      description: line.description,
      amount: num(line.amount),
      refunded_amount: num(line.refunded_amount),
      created_at: line.created_at,
    }))
    const attempts = row.payment_attempt.map((attempt): PaymentAttemptRecord => ({
      id: attempt.id,
      payment_id: attempt.payment_id,
      provider_session_id: attempt.provider_session_id,
      provider_intent_id: attempt.provider_intent_id,
      status: attempt.status as PaymentAttemptStatus,
      failure_code: attempt.failure_code,
      card_brand: attempt.card_brand,
      card_last4: attempt.card_last4,
      created_at: attempt.created_at,
      updated_at: attempt.updated_at,
    }))
    return {
      id: row.id,
      source_feature: row.source_feature as PaymentSourceFeature,
      purchase_ref: row.purchase_ref,
      payer_customer_id: row.payer_customer_id,
      booking_id: row.booking_id,
      cargo_booking_id: row.cargo_booking_id,
      voucher_id: row.voucher_id,
      idempotency_key: row.idempotency_key,
      status: row.status as PaymentStatus,
      provider: row.provider as PaymentProvider,
      currency: row.currency,
      amount_total: num(row.amount_total),
      voucher_amount: num(row.voucher_amount),
      card_amount: num(row.card_amount),
      provider_fee: row.provider_fee === null ? null : num(row.provider_fee),
      capture_attempts: row.capture_attempts,
      last_error: row.last_error,
      started_at: row.started_at,
      expires_at: row.expires_at,
      authorised_at: row.authorised_at,
      confirmed_at: CONFIRMED_STATUSES.includes(row.status) ? row.authorised_at : null,
      captured_at: row.captured_at,
      voided_at: row.voided_at,
      capture_stalled_at: row.capture_stalled_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      lines,
      attempts,
      context: this.toContext(row),
    }
  }

  /** TODO(F5a): the route, flight number and flown state come from Feature 3b's booking once it exists. */
  private toContext(row: PaymentRow): PaymentContext {
    const passenger = row.customer?.passenger
    const name = passenger ? `${passenger.first_name} ${passenger.last_name}`.trim() : ''
    return {
      customer_name: name || null,
      customer_email: row.customer?.user.email ?? null,
      booking_reference:
        row.booking?.booking_reference ??
        row.cargo_booking_payment_cargo_booking_idTocargo_booking?.booking_ref ??
        (row.source_feature === 17 ? null : row.purchase_ref),
      route: null,
      flight_number: null,
      flight_date: null,
      flown: false,
      /* Feature 5b has no number column, so its reference is the start of the refund's id. */
      refund_reference: row.refund[0] ? `REF-${row.refund[0].id.slice(0, 8).toUpperCase()}` : null,
    }
  }

  private toReceipt(row: Prisma.receiptGetPayload<object>): ReceiptRecord {
    return {
      id: row.id,
      payment_id: row.payment_id,
      refund_id: row.refund_id,
      document_type: row.document_type as ReceiptDocumentType,
      document_number: row.document_number,
      amount: num(row.amount),
      billing_name: row.billing_name,
      issued_at: row.issued_at,
      created_at: row.created_at,
    }
  }
}
