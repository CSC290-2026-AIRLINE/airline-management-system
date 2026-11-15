import { ForbiddenException, Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { fromCents, toCents } from '../money'
import { PaymentErrorCode, paymentError } from '../payments.errors'

export type Tx = Prisma.TransactionClient

// ---------------------------------------------------------------------------------------------------------------
// Settings: the closed list of payment_setting keys, with the documented defaults when a row is missing.

export const PAYMENT_SETTING_DEFAULTS = {
  min_hold_minutes: 3,
  capture_retry_limit: 5,
  voucher_valid_months: 12,
  overtime_threshold_hours: 10,
  overtime_multiplier: 1.5,
  pay_run_override_limit: 50000,
} as const
export type PaymentSettingKey = keyof typeof PAYMENT_SETTING_DEFAULTS

/** Keys that hold a decimal; the rest are whole numbers. */
const DECIMAL_SETTINGS: readonly PaymentSettingKey[] = ['overtime_threshold_hours', 'overtime_multiplier', 'pay_run_override_limit']

@Injectable()
export class PaymentSettingsService {
  constructor(private readonly db: DbService) {}

  /** The stored value, or the documented default when the row is missing or not a valid number for its key. */
  async get(key: PaymentSettingKey): Promise<number> {
    const row = await this.db.payment_setting.findUnique({ where: { key } })
    const value = Number(row?.value)
    const valid = Number.isFinite(value) && value >= 0 && (DECIMAL_SETTINGS.includes(key) || Number.isInteger(value))
    return valid ? value : PAYMENT_SETTING_DEFAULTS[key]
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Caller: who is asking. Customers reach only their own payments, refunds and vouchers; staff reach all.

export type Caller =
  | { kind: 'customer'; userId: string; customerId: string }
  | { kind: 'staff'; userId: string; staffId: string; isAdmin: boolean; roleCode: string }

@Injectable()
export class CallerService {
  constructor(private readonly db: DbService) {}

  async resolve(userId: string): Promise<Caller> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        type: true,
        disabled_at: true,
        deleted_at: true,
        customer: { where: { deleted_at: null }, select: { id: true }, take: 1 },
        staff: { where: { deleted_at: null }, select: { id: true, role: { select: { code: true, is_admin: true } } }, take: 1 },
      },
    })
    if (!user || user.deleted_at || user.disabled_at) {
      throw new ForbiddenException(paymentError(PaymentErrorCode.CUSTOMER_NOT_FOUND, 'No active account for this sign-in'))
    }
    const staff = user.staff[0]
    if (user.type === 'staff' && staff) {
      return { kind: 'staff', userId, staffId: staff.id, isAdmin: staff.role.is_admin, roleCode: staff.role.code }
    }
    const customer = user.customer[0]
    if (user.type === 'customer' && customer) return { kind: 'customer', userId, customerId: customer.id }
    throw new ForbiddenException(paymentError(PaymentErrorCode.CUSTOMER_NOT_FOUND, 'No customer or staff profile for this sign-in'))
  }

  async customer(userId: string): Promise<Extract<Caller, { kind: 'customer' }>> {
    const caller = await this.resolve(userId)
    if (caller.kind !== 'customer') {
      throw new ForbiddenException(paymentError(PaymentErrorCode.CUSTOMER_NOT_FOUND, 'This endpoint is for customer accounts'))
    }
    return caller
  }

  async staff(userId: string): Promise<Extract<Caller, { kind: 'staff' }>> {
    const caller = await this.resolve(userId)
    if (caller.kind !== 'staff') throw new ForbiddenException(paymentError(PaymentErrorCode.STAFF_ONLY, 'Staff only'))
    return caller
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Finance journal: one append-only row per money movement, written in the movement's own transaction.

export const POSTING_TYPES = [
  'payment_captured',
  'payment_provider_fee',
  'refund_succeeded',
  'refund_reversed',
  'voucher_issued',
  'voucher_redeemed',
  'voucher_expired',
  'compensation_paid',
  'crew_pay_accrued',
  'crew_pay_paid',
] as const
export type PostingType = (typeof POSTING_TYPES)[number]

export interface PostingInput {
  postingKey: string
  postingType: PostingType
  sourceType: 'payment' | 'refund' | 'compensation_voucher' | 'payroll_line' | 'pay_run'
  sourceId: string
  currency: string
  occurredAt: Date
  payload: Record<string, unknown>
}

@Injectable()
export class FinancePostingService {
  constructor(private readonly db: DbService) {}

  /** A repeat is a no-op (ON CONFLICT (posting_key) DO NOTHING). Must be called with the movement's transaction. */
  async post(tx: Tx, input: PostingInput): Promise<void> {
    await tx.finance_posting.createMany({
      data: [
        {
          posting_key: input.postingKey,
          posting_type: input.postingType,
          source_type: input.sourceType,
          source_id: input.sourceId,
          currency: input.currency,
          occurred_at: input.occurredAt,
          payload: input.payload as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    })
  }

  /**
   * The read method for the finance group and feature 4: by occurred_at range (never a "last seq seen" cursor, because
   * transactions commit out of seq order), with totals per posting type and category.
   */
  async read(from: Date, to: Date, postingType?: string) {
    const rows = await this.db.finance_posting.findMany({
      where: { occurred_at: { gte: from, lt: to }, ...(postingType && { posting_type: postingType }) },
      orderBy: [{ occurred_at: 'asc' }, { seq: 'asc' }],
      take: 1000,
    })
    const totals: Record<string, Record<string, string>> = {}
    for (const row of rows) {
      const lines = ((row.payload as { lines?: { category: string; amount: string }[] }).lines ?? []).filter(Boolean)
      const byType = (totals[row.posting_type] ??= {})
      for (const line of lines) byType[line.category] = fromCents(toCents(byType[line.category] ?? '0') + toCents(line.amount))
    }
    return { from, to, totals, postings: rows.map((r) => ({ ...r, seq: r.seq.toString() })) }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Messages through feature 13's inbound_event (source '5'). The key makes a repeat a no-op.

export type MessageType = 'payment_received' | 'refund_issued' | 'refund_failed' | 'voucher_issued'

@Injectable()
export class PaymentMessagesService {
  constructor(private readonly clock: SimulationClock) {}

  async send(tx: Tx, type: MessageType, sourceId: string, payload: Record<string, unknown>): Promise<void> {
    await tx.inbound_event.createMany({
      data: [
        {
          source: '5',
          source_event_id: `${type}:${sourceId}`,
          event_type: type,
          payload: payload as Prisma.InputJsonValue,
          received_at: this.clock.now(),
        },
      ],
      skipDuplicates: true,
    })
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Documents: one receipt or invoice per captured payment and one credit note per succeeded refund. Never edited.

const DOCUMENT_PREFIX = { receipt: 'RC', invoice: 'IN', credit_note: 'CN' } as const

@Injectable()
export class ReceiptService {
  async issue(
    tx: Tx,
    input: {
      paymentId: string
      refundId?: string | null
      documentType: keyof typeof DOCUMENT_PREFIX
      amountCents: number
      billingName: string | null
      issuedAt: Date
    },
  ) {
    const existing = await tx.receipt.findFirst({
      where: input.refundId ? { refund_id: input.refundId } : { payment_id: input.paymentId, refund_id: null },
    })
    if (existing) return existing
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('receipt_number_seq') AS n`
    const year = input.issuedAt.getUTCFullYear()
    return tx.receipt.create({
      data: {
        payment_id: input.paymentId,
        refund_id: input.refundId ?? null,
        document_type: input.documentType,
        document_number: `${DOCUMENT_PREFIX[input.documentType]}-${year}-${String(n).padStart(6, '0')}`,
        amount: fromCents(input.amountCents),
        billing_name: input.billingName,
        issued_at: input.issuedAt,
      },
    })
  }
}

/** Row lock on a payment, so every state move on it is serialised (problem 1 and 8 in the design). */
export async function lockPayment(tx: Tx, paymentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM payment WHERE id = ${paymentId}::uuid FOR UPDATE`
}
