import { randomInt } from 'node:crypto'
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { fromCents, toCents } from '../money'
import { PaymentErrorCode, paymentError } from '../payments.errors'
import { FinancePostingService, PaymentMessagesService, PaymentSettingsService, type Caller, type Tx } from './support.services'

/** A-Z and 2-9 without I and O (and without 0 and 1), as the voucher_code CHECK requires. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

export function generateVoucherCode(pick: (max: number) => number = randomInt): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[pick(CODE_ALPHABET.length)]
  return code
}

export function addMonths(date: Date, months: number): Date {
  const out = new Date(date)
  out.setUTCMonth(out.getUTCMonth() + months)
  return out
}

function normaliseCode(code: string) {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

/**
 * Compensation vouchers: single-use credit for one customer, redeemed whole. Reserved on a payment at checkout
 * (payment.voucher_id, guarded by a partial unique index), redeemed when that payment is captured, and free again as
 * soon as the payment is voided, fails or expires — the index only counts live payments, so no write is needed for that.
 */
@Injectable()
export class VoucherService {
  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    private readonly settings: PaymentSettingsService,
    private readonly postings: FinancePostingService,
    private readonly messages: PaymentMessagesService,
    private readonly audit: AuditService,
  ) {}

  /** Issues a voucher in the caller's transaction (for one feature 13 decision, or the voucher share of one refund). */
  async issue(
    tx: Tx,
    input: { customerId: string; amountCents: number; currency: string; caseCompensationId?: string; refundId?: string },
  ) {
    const now = this.clock.now()
    const months = await this.settings.get('voucher_valid_months')
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateVoucherCode()
      if (await tx.compensation_voucher.findUnique({ where: { code }, select: { id: true } })) continue
      const voucher = await tx.compensation_voucher.create({
        data: {
          code,
          customer_id: input.customerId,
          amount: fromCents(input.amountCents),
          currency: input.currency,
          case_compensation_id: input.caseCompensationId ?? null,
          refund_id: input.refundId ?? null,
          issued_at: now,
          expires_at: addMonths(now, months),
        },
      })
      await this.postings.post(tx, {
        postingKey: `voucher_issued:${voucher.id}`,
        postingType: 'voucher_issued',
        sourceType: 'compensation_voucher',
        sourceId: voucher.id,
        currency: voucher.currency,
        occurredAt: now,
        payload: {
          lines: [{ category: input.caseCompensationId ? 'compensation' : 'refund_voucher', amount: fromCents(input.amountCents) }],
          refund_id: input.refundId ?? null,
          case_compensation_id: input.caseCompensationId ?? null,
        },
      })
      await this.messages.send(tx, 'voucher_issued', voucher.id, {
        customer_id: input.customerId,
        amount: fromCents(input.amountCents),
        currency: voucher.currency,
        code: voucher.code,
        expires_at: voucher.expires_at,
      })
      return voucher
    }
    throw new ConflictException(paymentError(PaymentErrorCode.VOUCHER_INVALID, 'Could not generate a unique voucher code'))
  }

  /** POST /vouchers/validate: shows the value and what would be forfeited. Reserves nothing. */
  async validate(customerId: string, code: string, totalCents?: number) {
    const voucher = await this.db.compensation_voucher.findUnique({ where: { code: normaliseCode(code) } })
    const problem = await this.problemWith(voucher, customerId)
    if (problem || !voucher)
      throw new UnprocessableEntityException(paymentError(PaymentErrorCode.VOUCHER_INVALID, problem ?? 'Unknown code'))
    const value = toCents(voucher.amount)
    const applied = totalCents === undefined ? value : Math.min(value, totalCents)
    return {
      code: voucher.code,
      amount: fromCents(value),
      currency: voucher.currency,
      expires_at: voucher.expires_at,
      applied_amount: fromCents(applied),
      forfeited_amount: fromCents(value - applied),
    }
  }

  /** Locks the voucher row and checks it can pay for this checkout. Returns the share it pays. */
  async reserve(tx: Tx, customerId: string, code: string, totalCents: number) {
    const normalised = normaliseCode(code)
    await tx.$queryRaw`SELECT id FROM compensation_voucher WHERE code = ${normalised} FOR UPDATE`
    const voucher = await tx.compensation_voucher.findUnique({ where: { code: normalised } })
    const problem = await this.problemWith(voucher, customerId, tx)
    if (problem || !voucher)
      throw new UnprocessableEntityException(paymentError(PaymentErrorCode.VOUCHER_INVALID, problem ?? 'Unknown code'))
    return { voucherId: voucher.id, voucherCents: Math.min(toCents(voucher.amount), totalCents) }
  }

  /** On capture: the voucher is used. Any value above what it paid was forfeited at checkout. */
  async redeem(tx: Tx, voucherId: string, paymentId: string, usedCents: number, now: Date) {
    const voucher = await tx.compensation_voucher.update({
      where: { id: voucherId },
      data: { status: 'redeemed', redeemed_at: now, updated_at: new Date() },
    })
    await this.postings.post(tx, {
      postingKey: `voucher_redeemed:${voucherId}`,
      postingType: 'voucher_redeemed',
      sourceType: 'compensation_voucher',
      sourceId: voucherId,
      currency: voucher.currency,
      occurredAt: now,
      payload: {
        lines: [{ category: 'voucher', amount: fromCents(usedCents) }],
        payment_id: paymentId,
        forfeited: fromCents(toCents(voucher.amount) - usedCents),
      },
    })
  }

  listMine(customerId: string) {
    return this.db.compensation_voucher.findMany({
      where: { customer_id: customerId },
      orderBy: { issued_at: 'desc' },
      select: { id: true, code: true, amount: true, currency: true, status: true, issued_at: true, expires_at: true, redeemed_at: true },
    })
  }

  listForStaff(filter: { status?: string; customerId?: string; code?: string }) {
    return this.db.compensation_voucher.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
        ...(filter.customerId && { customer_id: filter.customerId }),
        ...(filter.code && { code: { contains: normaliseCode(filter.code) } }),
      },
      orderBy: { issued_at: 'desc' },
      take: 200,
      include: { customer: { select: { id: true, passenger: { select: { first_name: true, last_name: true } } } } },
    })
  }

  /** PUT /staff/vouchers/:id: cancel with a reason, logged in feature 15's audit_log in the same transaction. */
  async cancel(staff: Extract<Caller, { kind: 'staff' }>, id: string, reason: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM compensation_voucher WHERE id = ${id}::uuid FOR UPDATE`
      const voucher = await tx.compensation_voucher.findUnique({ where: { id } })
      if (!voucher) throw new NotFoundException(paymentError(PaymentErrorCode.VOUCHER_INVALID, 'Voucher not found'))
      if (voucher.status !== 'active') {
        throw new ConflictException(paymentError(PaymentErrorCode.VOUCHER_INVALID, `A ${voucher.status} voucher cannot be cancelled`))
      }
      const reserved = await tx.payment.findFirst({
        where: { voucher_id: id, status: { in: ['created', 'authorised'] } },
        select: { id: true },
      })
      if (reserved) {
        throw new ConflictException(paymentError(PaymentErrorCode.VOUCHER_INVALID, 'The voucher is reserved by an open payment'))
      }
      await this.audit.write(
        {
          actor: { type: 'staff', id: staff.userId, role: staff.roleCode },
          sourceFeature: '5',
          action: 'status_change',
          entityType: 'compensation_voucher',
          entityId: id,
          summary: `Cancelled voucher ${voucher.code} (${voucher.amount.toString()} ${voucher.currency})`,
          reason,
          before: { status: voucher.status },
          after: { status: 'cancelled' },
        },
        tx,
      )
      return tx.compensation_voucher.update({
        where: { id },
        data: { status: 'cancelled', cancel_reason: reason.trim(), updated_at: new Date() },
      })
    })
  }

  /** Job: active vouchers past their expiry become expired, with a voucher_expired posting each. */
  async expireDue(): Promise<number> {
    const now = this.clock.now()
    const due = await this.db.compensation_voucher.findMany({
      where: { status: 'active', expires_at: { lte: now } },
      select: { id: true },
      take: 100,
    })
    for (const { id } of due) {
      await this.db.$transaction(async (tx) => {
        const updated = await tx.compensation_voucher.updateMany({
          where: { id, status: 'active', payment: { none: { status: { in: ['created', 'authorised'] } } } },
          data: { status: 'expired', updated_at: new Date() },
        })
        if (updated.count === 0) return
        const voucher = await tx.compensation_voucher.findUniqueOrThrow({ where: { id } })
        await this.postings.post(tx, {
          postingKey: `voucher_expired:${id}`,
          postingType: 'voucher_expired',
          sourceType: 'compensation_voucher',
          sourceId: id,
          currency: voucher.currency,
          occurredAt: now,
          payload: { lines: [{ category: 'voucher', amount: fromCents(toCents(voucher.amount)) }] },
        })
      })
    }
    return due.length
  }

  private async problemWith(
    voucher: { id: string; customer_id: string; status: string; expires_at: Date } | null,
    customerId: string,
    client: Pick<Tx, 'payment'> = this.db,
  ): Promise<string | null> {
    // A code that belongs to someone else answers the same as an unknown one.
    if (!voucher || voucher.customer_id !== customerId) return 'This voucher code is not valid for your account'
    if (voucher.status !== 'active') return `This voucher is ${voucher.status}`
    if (voucher.expires_at <= this.clock.now()) return 'This voucher has expired'
    const reserved = await client.payment.findFirst({
      where: { voucher_id: voucher.id, status: { in: ['created', 'authorised', 'captured', 'reversed'] } },
      select: { id: true },
    })
    if (reserved) return 'This voucher is already being used by another payment'
    return null
  }
}
