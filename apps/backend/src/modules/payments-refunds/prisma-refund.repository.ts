import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import {
  refundReversedPosting,
  voucherExpiredPosting,
  refundSucceededPostings,
  voucherIssuedPosting,
  writePostings,
} from '@backend/modules/payments-checkout/finance-journal'
import { messageAmount, messageDate, purchaseReferenceOf, queueCustomerMessage } from '@backend/modules/payments-checkout/customer-messages'
import type { RefundRepository } from './refund-repository.interface'
import type { RefundMethod, RefundReason, RefundStatus, VoucherStatus } from './refund-status'
import type {
  BookingInfo,
  FlightCancellation,
  PaidOnFlight,
  PaidPayment,
  RefundablePayment,
  RefundRecord,
  VoucherRecord,
} from './refund.types'

/** The most rows one list reads. The queue and the history are short today; add a cursor before they are not. */
const LIST_LIMIT = 500

/** The refunds that still hold part of the payment. A rejected or failed one gives its lines back. */
const GIVES_BACK = ['rejected', 'failed'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The reference a person reads for a payment: the booking's own reference, or the purchase_ref of anything else. */
const refOf = (payment: { purchase_ref: string; booking?: { booking_reference: string } | null }): string =>
  payment.booking?.booking_reference ?? payment.purchase_ref

const num = (value: { toString(): string }): number => Number(value.toString())

/** What a refund row needs from the payment it is on. */
const REFUND_INCLUDE = {
  payment: {
    select: {
      purchase_ref: true,
      booking: { select: { booking_reference: true } },
      payer_customer_id: true,
      currency: true,
      amount_total: true,
      payment_attempt: {
        where: { card_last4: { not: null } },
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { card_brand: true, card_last4: true },
      },
    },
  },
  refund_line: { select: { payment_line: { select: { description: true } } } },
  /** The credit note, once a card refund went through (at most one: the schema keeps `(refund_id, payment_id)` unique). */
  receipt: { select: { document_number: true } },
} satisfies Prisma.refundInclude
type RefundRow = Prisma.refundGetPayload<{ include: typeof REFUND_INCLUDE }>

/** What a voucher row needs from the refund and the payment around it. */
const VOUCHER_INCLUDE = {
  refund: {
    select: {
      decision_note: true,
      reason: true,
      payment: { select: { purchase_ref: true, booking: { select: { booking_reference: true } } } },
    },
  },
  payment: { select: { purchase_ref: true, booking: { select: { booking_reference: true } } }, take: 1 },
} satisfies Prisma.compensation_voucherInclude
type VoucherRow = Prisma.compensation_voucherGetPayload<{ include: typeof VOUCHER_INCLUDE }>

/** The audit rows that hold what the refund table has no column for. */
interface AuditFact {
  entity_id: string | null
  action: string
  actor_role: string | null
  after: Prisma.JsonValue | null
}

/** `REF-3FA9C21B`: the start of the id, because the table has no number column. */
function referenceOf(id: string): string {
  return `REF-${id.slice(0, 8).toUpperCase()}`
}

/** The ten characters the schema stores, from the `VCH-XXXXX-XXXXX` a person reads. */
export function storedCode(code: string): string {
  return code.replace(/^VCH-/i, '').replace(/-/g, '').toUpperCase()
}

/** The `VCH-XXXXX-XXXXX` a person reads, from the ten characters the schema stores. */
export function shownCode(stored: string): string {
  return `VCH-${stored.slice(0, 5)}-${stored.slice(5)}`
}

/** A string out of an audit row's JSON, or null. */
function text(json: Prisma.JsonValue | null | undefined, key: string): string | null {
  if (json === null || json === undefined || typeof json !== 'object' || Array.isArray(json)) return null
  const value = json[key]
  return typeof value === 'string' ? value : null
}

function flag(json: Prisma.JsonValue | null | undefined, key: string): boolean {
  if (json === null || json === undefined || typeof json !== 'object' || Array.isArray(json)) return false
  return json[key] === true
}

/**
 * Feature 5b's repository over the real tables: `refund`, `refund_line`, `compensation_voucher`, and the `payment` rows
 * they hang off.
 *
 * What the screens show but the tables do not hold is read from where it lives: the line from `refund_line` (or, for a
 * request, the audit trail), the customer's own words and the staff override from `audit_log`, the card from the
 * payment's attempt. The fare rule check is Feature 4's `quote-fee`, which is not connected, so every refund reads as
 * inside the rules and staff decide.
 */
@Injectable()
export class PrismaRefundRepository implements RefundRepository {
  constructor(private readonly db: DbService) {}

  /* ---- Refunds ----------------------------------------------------------------------------------------------- */

  async listRefunds(): Promise<RefundRecord[]> {
    const rows = await this.db.refund.findMany({ orderBy: { requested_at: 'desc' }, take: LIST_LIMIT, include: REFUND_INCLUDE })
    const facts = await this.auditFor(rows.map((row) => row.id))
    return rows.map((row) => this.toRecord(row, facts.get(row.id) ?? []))
  }

  async findRefundById(id: string): Promise<RefundRecord | undefined> {
    if (!UUID.test(id)) return undefined
    const row = await this.db.refund.findUnique({ where: { id }, include: REFUND_INCLUDE })
    if (!row) return undefined
    return this.toRecord(row, (await this.auditFor([id])).get(id) ?? [])
  }

  async findRefundByReference(reference: string): Promise<RefundRecord | undefined> {
    const match = /^REF-([0-9A-F]{8})$/i.exec(reference.trim())
    if (!match) return undefined
    const found = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT id::text AS id FROM refund WHERE id::text LIKE ${`${match[1].toLowerCase()}%`} LIMIT 1`
    return found[0] ? this.findRefundById(found[0].id) : undefined
  }

  async insertRefund(refund: RefundRecord): Promise<RefundRecord> {
    await this.db.$transaction((tx) => this.createRefund(tx, refund))
    refund.reference = referenceOf(refund.id)
    return refund
  }

  async updateRefund(refund: RefundRecord): Promise<RefundRecord> {
    await this.db.$transaction((tx) => this.changeRefund(tx, refund))
    return refund
  }

  async saveRefundWithVoucher(refund: RefundRecord, voucher: VoucherRecord, mode: 'insert' | 'update') {
    await this.db.$transaction(async (tx) => {
      if (mode === 'insert') await this.createRefund(tx, refund)
      else await this.changeRefund(tx, refund)
      await tx.compensation_voucher.create({
        data: {
          id: voucher.id,
          code: storedCode(voucher.code),
          customer_id: voucher.customer_id,
          amount: voucher.amount,
          currency: voucher.currency,
          status: voucher.status,
          refund_id: voucher.refund_id,
          case_compensation_id: voucher.case_compensation_id,
          issued_at: voucher.issued_at,
          expires_at: voucher.expires_at,
          created_at: voucher.created_at,
          updated_at: voucher.updated_at,
        },
      })
      await writePostings(tx, [voucherIssuedPosting(voucher)])
      await queueCustomerMessage(tx, {
        type: 'voucher_issued',
        sourceId: voucher.id,
        customerId: voucher.customer_id,
        at: voucher.issued_at,
        placeholders: {
          voucher_code: voucher.code,
          amount: messageAmount(voucher.amount, voucher.currency),
          expires_on: messageDate(voucher.expires_at),
        },
      })
    })
    refund.reference = referenceOf(refund.id)
    return { refund, voucher }
  }

  /** Writes a new refund, and the `refund_line` and the line's `refunded_amount` that go with it. */
  private async createRefund(tx: Prisma.TransactionClient, refund: RefundRecord): Promise<void> {
    await tx.refund.create({
      data: {
        id: refund.id,
        payment_id: refund.payment_id,
        source_key: refund.source_key,
        reason: refund.reason,
        method: refund.method,
        status: refund.status,
        amount: refund.amount,
        voucher_amount: refund.voucher_amount,
        fee_withheld: refund.fee_withheld,
        provider_refund_id: refund.provider_refund_id,
        requested_by_user_id: refund.requested_by_user_id,
        case_compensation_id: refund.case_compensation_id,
        decision_note: refund.decision_note,
        failure_reason: refund.failure_reason,
        requested_at: refund.requested_at,
        completed_at: refund.completed_at,
        created_at: refund.created_at,
        updated_at: refund.updated_at,
      },
    })
    const lines = refund.lines ?? (refund.payment_line_id ? [{ payment_line_id: refund.payment_line_id, amount: refund.amount }] : [])
    for (const line of lines) {
      await tx.refund_line.create({
        data: { refund_id: refund.id, payment_id: refund.payment_id, payment_line_id: line.payment_line_id, amount: line.amount },
      })
      await tx.payment_line.update({ where: { id: line.payment_line_id }, data: { refunded_amount: { increment: line.amount } } })
    }
    await this.messageRefund(tx, refund, null)
  }

  /** Writes what a decision changes, and gives the lines back when the refund stops counting. */
  private async changeRefund(tx: Prisma.TransactionClient, refund: RefundRecord): Promise<void> {
    const before = await tx.refund.findUniqueOrThrow({
      where: { id: refund.id },
      select: { status: true, refund_line: { select: { payment_line_id: true, amount: true } } },
    })
    await tx.refund.update({
      where: { id: refund.id },
      data: {
        method: refund.method,
        status: refund.status,
        voucher_amount: refund.voucher_amount,
        provider_refund_id: refund.provider_refund_id,
        decision_note: refund.decision_note,
        failure_reason: refund.failure_reason,
        completed_at: refund.completed_at,
        updated_at: refund.updated_at,
      },
    })
    await this.postRefundMovement(tx, refund, before.status)
    await this.messageRefund(tx, refund, before.status)
    const wasCounted = !(GIVES_BACK as readonly string[]).includes(before.status)
    const isCounted = !(GIVES_BACK as readonly string[]).includes(refund.status)
    if (wasCounted && !isCounted) {
      for (const line of before.refund_line) {
        await tx.payment_line.update({ where: { id: line.payment_line_id }, data: { refunded_amount: { decrement: line.amount } } })
      }
    } else if (!wasCounted && isCounted) {
      /* A failed payout the provider later confirmed, or one staff returned as a voucher, holds its lines again. */
      for (const line of before.refund_line) {
        await tx.payment_line.update({ where: { id: line.payment_line_id }, data: { refunded_amount: { increment: line.amount } } })
      }
    }
  }

  /**
   * The customer's message for a refund that just finished, in the same transaction as the change: `refund_issued` for
   * the cash part of one that succeeded (the voucher part has its own `voucher_issued`), `refund_failed` for one that
   * failed, including a late failure after it had succeeded.
   */
  private async messageRefund(tx: Prisma.TransactionClient, refund: RefundRecord, before: string | null): Promise<void> {
    if (refund.status === before) return
    const cash = refund.amount - refund.voucher_amount
    const type = refund.status === 'succeeded' && cash > 0 ? 'refund_issued' : refund.status === 'failed' ? 'refund_failed' : null
    if (!type) return
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: refund.payment_id },
      select: { payer_customer_id: true, currency: true },
    })
    await queueCustomerMessage(tx, {
      type,
      sourceId: refund.id,
      customerId: payment.payer_customer_id,
      at: refund.completed_at ?? refund.updated_at,
      placeholders: {
        reference: await purchaseReferenceOf(tx, refund.payment_id),
        amount: messageAmount(type === 'refund_issued' ? cash : refund.amount, payment.currency),
      },
    })
  }

  /**
   * The journal rows of a refund that just changed, written in the same transaction as the change: a card refund that
   * succeeded posts `refund_succeeded` (or `compensation_paid`), one that had succeeded and then failed late posts
   * `refund_reversed`. A refund returned as a voucher is not cash out, so it posts through its voucher instead.
   */
  private async postRefundMovement(tx: Prisma.TransactionClient, refund: RefundRecord, before: string): Promise<void> {
    const nowSucceeded = refund.status === 'succeeded' && before !== 'succeeded' && refund.method === 'original'
    const lateFailure = before === 'succeeded' && refund.status === 'failed' && refund.method === 'original'
    if (!nowSucceeded && !lateFailure) return
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.payment_id }, select: { currency: true } })
    const at = refund.completed_at ?? refund.updated_at
    if (lateFailure) {
      await writePostings(tx, [refundReversedPosting({ ...refund, currency: payment.currency, at: refund.updated_at })])
      return
    }
    const lines = await tx.refund_line.findMany({
      where: { refund_id: refund.id },
      select: { amount: true, payment_line: { select: { line_type: true } } },
    })
    await writePostings(
      tx,
      refundSucceededPostings({
        ...refund,
        currency: payment.currency,
        at,
        lines: lines.map((line) => ({ line_type: line.payment_line.line_type, amount: num(line.amount) })),
      }),
    )
  }

  /* ---- Airline cancellations --------------------------------------------------------------------------------- */

  async listUnprocessedFlightCancellations(): Promise<FlightCancellation[]> {
    const rows = await this.db.flight_event.findMany({
      where: { type: 'cancelled', resolution: 'refund', refund_event_receipt: null },
      orderBy: { seq: 'asc' },
      take: LIST_LIMIT,
      select: { id: true, flight_id: true, seq: true },
    })
    return rows.map((row) => ({ event_id: row.id, flight_id: row.flight_id, seq: Number(row.seq) }))
  }

  async listPaidLinesOnFlight(flightId: string): Promise<PaidOnFlight[]> {
    const payments = await this.db.payment.findMany({
      where: {
        status: 'captured',
        payment_line_payment_line_payment_idTopayment: {
          some: { line_type: { in: ['fare', 'award_fee', 'seat_fee'] }, booking_coupon: { flight_id: flightId } },
        },
      },
      take: LIST_LIMIT,
      select: {
        id: true,
        purchase_ref: true,
        booking: { select: { booking_reference: true } },
        payer_customer_id: true,
        currency: true,
        amount_total: true,
        payment_attempt: {
          where: { card_last4: { not: null } },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { card_brand: true, card_last4: true },
        },
        payment_line_payment_line_payment_idTopayment: {
          where: { line_type: { in: ['fare', 'award_fee', 'seat_fee'] }, booking_coupon: { flight_id: flightId } },
          orderBy: { created_at: 'asc' },
          select: { id: true, description: true, amount: true, refunded_amount: true },
        },
      },
    })
    return payments
      .map((payment) => ({
        booking: {
          reference: refOf(payment),
          customer_id: payment.payer_customer_id ?? '',
          payment_id: payment.id,
          currency: payment.currency,
          total: num(payment.amount_total),
          card_brand: payment.payment_attempt[0]?.card_brand ?? null,
          card_last4: payment.payment_attempt[0]?.card_last4 ?? null,
        },
        lines: payment.payment_line_payment_line_payment_idTopayment
          .map((line) => ({
            payment_line_id: line.id,
            description: line.description,
            remaining: Math.max(0, num(line.amount) - num(line.refunded_amount)),
          }))
          .filter((line) => line.remaining > 0),
      }))
      .filter((payment) => payment.lines.length > 0)
  }

  async findPaidPayment(paymentId: string, lineTypes: string[] = ['fare', 'award_fee', 'seat_fee']): Promise<PaidPayment | undefined> {
    const payment = await this.db.payment.findFirst({
      where: { id: paymentId, status: 'captured' },
      select: {
        id: true,
        purchase_ref: true,
        booking: { select: { booking_reference: true } },
        payer_customer_id: true,
        currency: true,
        amount_total: true,
        voucher_amount: true,
        payment_attempt: {
          where: { card_last4: { not: null } },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { card_brand: true, card_last4: true },
        },
        payment_line_payment_line_payment_idTopayment: {
          where: { line_type: { in: lineTypes } },
          orderBy: { created_at: 'asc' },
          select: { id: true, description: true, amount: true, refunded_amount: true },
        },
      },
    })
    if (!payment) return undefined
    return {
      booking: {
        reference: refOf(payment),
        customer_id: payment.payer_customer_id ?? '',
        payment_id: payment.id,
        currency: payment.currency,
        total: num(payment.amount_total),
        card_brand: payment.payment_attempt[0]?.card_brand ?? null,
        card_last4: payment.payment_attempt[0]?.card_last4 ?? null,
      },
      amount_total: num(payment.amount_total),
      voucher_amount: num(payment.voucher_amount),
      lines: payment.payment_line_payment_line_payment_idTopayment
        .map((line) => ({
          payment_line_id: line.id,
          description: line.description,
          remaining: Math.max(0, num(line.amount) - num(line.refunded_amount)),
        }))
        .filter((line) => line.remaining > 0),
    }
  }

  async insertFlightRefunds(eventId: string, refunds: RefundRecord[], at: Date): Promise<RefundRecord[]> {
    const created = await this.db.$transaction(async (tx) => {
      const made: RefundRecord[] = []
      for (const refund of refunds) {
        /* The payment's row lock: a payment and its refunds change one at a time (the counter is raised under it). */
        await tx.$executeRaw`SELECT 1 FROM payment WHERE id = ${refund.payment_id}::uuid FOR UPDATE`
        const known = await tx.refund.findUnique({ where: { source_key: refund.source_key }, select: { id: true } })
        if (known) continue
        await this.createRefund(tx, refund)
        made.push(refund)
      }
      /* The receipt goes in with the refunds, so an event is either fully handled or not at all. A replay finds it. */
      await tx.refund_event_receipt.upsert({ where: { event_id: eventId }, create: { event_id: eventId, processed_at: at }, update: {} })
      return made
    })
    for (const refund of created) refund.reference = referenceOf(refund.id)
    return created
  }

  /* ---- Vouchers ---------------------------------------------------------------------------------------------- */

  async expireDueVouchers(now: Date): Promise<number> {
    return this.db.$transaction(async (tx) => {
      const due = await tx.compensation_voucher.findMany({
        where: { status: 'active', expires_at: { lte: now } },
        take: LIST_LIMIT,
        select: { id: true, amount: true, currency: true, expires_at: true },
      })
      if (due.length === 0) return 0
      await tx.compensation_voucher.updateMany({
        where: { id: { in: due.map((v) => v.id) }, status: 'active' },
        data: { status: 'expired', updated_at: now },
      })
      await writePostings(
        tx,
        due.map((v) => voucherExpiredPosting({ id: v.id, amount: num(v.amount), currency: v.currency, expires_at: v.expires_at })),
      )
      return due.length
    })
  }

  async listVouchers(): Promise<VoucherRecord[]> {
    const rows = await this.db.compensation_voucher.findMany({ orderBy: { issued_at: 'desc' }, take: LIST_LIMIT, include: VOUCHER_INCLUDE })
    return rows.map((row) => this.toVoucher(row))
  }

  async findVoucherById(id: string): Promise<VoucherRecord | undefined> {
    if (!UUID.test(id)) return undefined
    const row = await this.db.compensation_voucher.findUnique({ where: { id }, include: VOUCHER_INCLUDE })
    return row ? this.toVoucher(row) : undefined
  }

  async findVoucherByCode(code: string): Promise<VoucherRecord | undefined> {
    const row = await this.db.compensation_voucher.findUnique({ where: { code: storedCode(code) }, include: VOUCHER_INCLUDE })
    return row ? this.toVoucher(row) : undefined
  }

  async updateVoucher(voucher: VoucherRecord): Promise<VoucherRecord> {
    await this.db.compensation_voucher.update({
      where: { id: voucher.id },
      data: {
        status: voucher.status,
        cancel_reason: voucher.cancel_reason,
        redeemed_at: voucher.redeemed_at,
        updated_at: voucher.updated_at,
      },
    })
    return voucher
  }

  /* ---- Payments ---------------------------------------------------------------------------------------------- */

  async findBooking(reference: string): Promise<BookingInfo | undefined> {
    const payment = await this.db.payment.findFirst({
      where: {
        // The customer reads the booking's own reference; any other purchase is named by its purchase_ref.
        OR: [{ purchase_ref: reference }, { booking: { booking_reference: reference } }],
        status: 'captured',
        payer_customer_id: { not: null },
      },
      orderBy: { started_at: 'desc' },
      select: {
        id: true,
        payer_customer_id: true,
        currency: true,
        amount_total: true,
        purchase_ref: true,
        booking: { select: { booking_reference: true } },
        payment_attempt: {
          where: { card_last4: { not: null } },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { card_brand: true, card_last4: true },
        },
      },
    })
    if (!payment?.payer_customer_id) return undefined
    return {
      reference: refOf(payment),
      customer_id: payment.payer_customer_id,
      payment_id: payment.id,
      currency: payment.currency,
      total: num(payment.amount_total),
      card_brand: payment.payment_attempt[0]?.card_brand ?? null,
      card_last4: payment.payment_attempt[0]?.card_last4 ?? null,
    }
  }

  async resolveCustomerId(userId: string): Promise<string | undefined> {
    if (!UUID.test(userId)) return undefined
    const customer = await this.db.customer.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    return customer?.id
  }

  async listRefundable(customerId: string): Promise<RefundablePayment[]> {
    const payments = await this.db.payment.findMany({
      where: { payer_customer_id: customerId, status: 'captured' },
      orderBy: { started_at: 'desc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        purchase_ref: true,
        booking: { select: { booking_reference: true } },
        currency: true,
        amount_total: true,
        payment_attempt: {
          where: { card_last4: { not: null } },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { card_brand: true, card_last4: true },
        },
        payment_line_payment_line_payment_idTopayment: {
          orderBy: { created_at: 'asc' },
          select: { id: true, description: true, amount: true, refunded_amount: true },
        },
        /* A voucher given as goodwill (a staff adjustment as a voucher) is not money taken back out of the payment. */
        refund: {
          where: { status: { notIn: [...GIVES_BACK] }, NOT: { reason: 'staff_adjustment', method: 'voucher' } },
          select: { amount: true },
        },
      },
    })

    return payments.map((payment) => {
      const total = num(payment.amount_total)
      const rows = payment.payment_line_payment_line_payment_idTopayment
      /* A payment with no lines is one line: the whole payment, less what is already refunded or asked for. */
      const lines =
        rows.length > 0
          ? rows.map((line) => ({
              payment_line_id: line.id,
              description: line.description,
              amount: num(line.amount),
              remaining: Math.max(0, num(line.amount) - num(line.refunded_amount)),
            }))
          : [
              {
                payment_line_id: null,
                description: `Payment · ${refOf(payment)}`,
                amount: total,
                remaining: Math.max(0, total - payment.refund.reduce((sum, row) => sum + num(row.amount), 0)),
              },
            ]
      return {
        booking: {
          reference: refOf(payment),
          customer_id: customerId,
          payment_id: payment.id,
          currency: payment.currency,
          total,
          card_brand: payment.payment_attempt[0]?.card_brand ?? null,
          card_last4: payment.payment_attempt[0]?.card_last4 ?? null,
        },
        total,
        lines,
      }
    })
  }

  async voucherValidMonths(): Promise<number> {
    const setting = await this.db.payment_setting.findUnique({ where: { key: 'voucher_valid_months' }, select: { value: true } })
    const months = Number(setting?.value)
    return Number.isInteger(months) && months > 0 ? months : 12
  }

  /* ---- Mapping ----------------------------------------------------------------------------------------------- */

  /** The audit rows of Feature 5 for these refunds, oldest first, grouped by refund. */
  private async auditFor(ids: string[]): Promise<Map<string, AuditFact[]>> {
    const grouped = new Map<string, AuditFact[]>()
    if (ids.length === 0) return grouped
    const rows = await this.db.audit_log.findMany({
      where: { source_feature: '5', entity_type: 'refund', entity_id: { in: ids }, action: { in: ['create', 'status_change'] } },
      orderBy: { seq: 'asc' },
      select: { entity_id: true, action: true, actor_role: true, after: true },
    })
    for (const row of rows) {
      if (!row.entity_id) continue
      grouped.set(row.entity_id, [...(grouped.get(row.entity_id) ?? []), row])
    }
    return grouped
  }

  private toRecord(row: RefundRow, facts: AuditFact[]): RefundRecord {
    const created = facts.find((fact) => fact.action === 'create')
    const decided = [...facts].reverse().find((fact) => fact.action === 'status_change')
    const attempt = row.payment.payment_attempt[0]
    const open = row.status === 'requested' || row.status === 'pending_approval'
    const item =
      text(created?.after, 'item') ?? row.refund_line[0]?.payment_line.description ?? row.decision_note ?? `Payment · ${refOf(row.payment)}`

    return {
      id: row.id,
      reference: referenceOf(row.id),
      payment_id: row.payment_id,
      payment_line_id: null,
      source_key: row.source_key,
      reason: row.reason as RefundReason,
      method: row.method as RefundMethod,
      status: row.status as RefundStatus,
      amount: num(row.amount),
      voucher_amount: num(row.voucher_amount),
      fee_withheld: num(row.fee_withheld),
      provider_refund_id: row.provider_refund_id,
      requested_by_user_id: row.requested_by_user_id,
      case_compensation_id: row.case_compensation_id,
      audit_log_id: row.audit_log_id,
      decision_note: row.decision_note,
      failure_reason: row.failure_reason,
      requested_at: row.requested_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      context: {
        customer_id: row.payment.payer_customer_id ?? '',
        booking_reference: refOf(row.payment),
        item,
        customer_reason: text(created?.after, 'customer_reason'),
        fare_rule: 'inside',
        fare_rule_label: 'Inside rules',
        fare_rule_note: "The fare rule check comes from Feature 4's quote and is not connected yet, so staff decide.",
        paid_by: attempt?.card_last4
          ? `Card ${attempt.card_last4} (${num(row.payment.amount_total).toFixed(2)}) · no voucher`
          : `Card (${num(row.payment.amount_total).toFixed(2)}) · no voucher`,
        card_brand: attempt?.card_brand ?? null,
        card_last4: attempt?.card_last4 ?? null,
        credit_note_number: row.receipt?.document_number ?? null,
        voucher_code: null,
        decided_at: open ? null : row.updated_at,
        decided_by: open ? null : (decided?.actor_role ?? null),
        override: flag(decided?.after, 'override'),
        older: false,
      },
    }
  }

  private toVoucher(row: VoucherRow): VoucherRecord {
    const booking = row.refund ? refOf(row.refund.payment) : '—'
    const usedOn = row.payment[0] ? refOf(row.payment[0]) : undefined
    return {
      id: row.id,
      code: shownCode(row.code),
      customer_id: row.customer_id,
      amount: num(row.amount),
      currency: row.currency,
      status: row.status as VoucherStatus,
      case_compensation_id: row.case_compensation_id,
      refund_id: row.refund_id,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      redeemed_at: row.redeemed_at,
      cancel_reason: row.cancel_reason,
      created_at: row.created_at,
      updated_at: row.updated_at,
      booking_reference: booking,
      note: row.refund?.decision_note ?? '',
      description: row.refund?.reason === 'staff_adjustment' ? 'Compensation issued by staff' : 'Issued as the voucher share of a refund',
      used_on: usedOn ? `Used on booking ${usedOn}` : null,
    }
  }
}
