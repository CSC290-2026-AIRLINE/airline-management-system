import { randomInt, randomUUID } from 'node:crypto'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { paymentReference } from '@backend/modules/payments-checkout/payment-status'
import { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import type { CreateDevPaymentDto } from './dto/create-dev-payment.dto'

/** Every payment these tools make has an idempotency key that starts with this, so they can be found and removed. */
export const DEV_KEY_PREFIX = 'dev-'

/** The characters of a booking reference (no I, O, 0 or 1, which are easy to misread). */
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * A purchase reference in the form of a booking reference: six characters of `A-Z0-9`. The customer's refund request takes
 * the payment's reference as its booking reference and accepts only that form, so a tagged reference such as `DEVxxxxxx`
 * would make "Request a refund" fail.
 */
function newReference(): string {
  return Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('')
}

export interface DevPaymentDto {
  id: string
  /** `PAY-20261115-F5E3`: what the staff screens call it. */
  reference: string
  purchase_ref: string
  description: string
  status: string
  provider: string
  amount: number
  currency: string
  started_at: string
  expires_at: string
}

/**
 * TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.
 *
 * A stand-in for the selling feature (3b, 6, 12, 17), so Feature 5a can be tried end to end before one exists: it starts
 * a payment for the signed-in customer through the same `createPayment` a selling feature calls. Everything after that,
 * the Stripe page, the webhook, the receipt, the result page, the refund, is the real thing.
 */
@Injectable()
export class DevPaymentsService {
  constructor(
    private readonly db: DbService,
    private readonly payments: PaymentsCheckoutService,
    private readonly clock: SimulationClock,
  ) {}

  private async customerOf(userId: string): Promise<string> {
    const customer = await this.db.customer.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    if (!customer) throw new ForbiddenException('Sign in as a customer to use the payment test tools')
    return customer.id
  }

  /** Starts a payment the way a selling feature would. The customer then pays it with `POST /api/payments/:id/checkout`. */
  async create(userId: string, dto: CreateDevPaymentDto): Promise<DevPaymentDto> {
    const customerId = await this.customerOf(userId)
    const payment = await this.payments.createPayment({
      source_feature: 12,
      purchase_ref: newReference(),
      payer_customer_id: customerId,
      idempotency_key: `${DEV_KEY_PREFIX}${randomUUID()}`,
      amount_total: dto.amount,
      expires_at: new Date(this.clock.now().getTime() + (dto.hold_minutes ?? 25) * 60_000),
      lines: [{ line_type: 'onboard_order', description: dto.description || 'Test payment', amount: dto.amount }],
    })
    return {
      id: payment.id,
      reference: paymentReference(payment),
      purchase_ref: payment.purchase_ref,
      description: dto.description || 'Test payment',
      status: payment.status,
      provider: payment.provider,
      amount: payment.amount_total,
      currency: payment.currency,
      started_at: payment.started_at.toISOString(),
      expires_at: payment.expires_at.toISOString(),
    }
  }

  /** The signed-in customer's test payments, newest first. */
  async list(userId: string): Promise<DevPaymentDto[]> {
    const customerId = await this.customerOf(userId)
    const rows = await this.db.payment.findMany({
      where: { payer_customer_id: customerId, idempotency_key: { startsWith: DEV_KEY_PREFIX } },
      orderBy: { started_at: 'desc' },
      take: 10,
      include: { payment_line_payment_line_payment_idTopayment: { select: { description: true }, take: 1 } },
    })
    return rows.map((row) => ({
      id: row.id,
      reference: paymentReference({ id: row.id, started_at: row.started_at }),
      purchase_ref: row.purchase_ref,
      description: row.payment_line_payment_line_payment_idTopayment[0]?.description ?? 'Test payment',
      status: row.status,
      provider: row.provider,
      amount: Number(row.amount_total),
      currency: row.currency,
      started_at: row.started_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
    }))
  }

  /**
   * Removes the signed-in customer's test payments with everything that hangs off them (receipts and credit notes,
   * refunds and the vouchers they returned, attempts, lines, webhook receipts), in the order the foreign keys allow.
   * A page that is still open on Stripe's side is left to expire there.
   */
  async removeAll(userId: string): Promise<{ removed: number }> {
    const customerId = await this.customerOf(userId)
    const ids = (
      await this.db.payment.findMany({
        where: { payer_customer_id: customerId, idempotency_key: { startsWith: DEV_KEY_PREFIX } },
        select: { id: true },
      })
    ).map((row) => row.id)
    if (ids.length === 0) return { removed: 0 }

    await this.db.$transaction(async (tx) => {
      const refundIds = (await tx.refund.findMany({ where: { payment_id: { in: ids } }, select: { id: true } })).map((row) => row.id)
      await tx.payment_event_receipt.deleteMany({ where: { payment_id: { in: ids } } })
      await tx.receipt.deleteMany({ where: { payment_id: { in: ids } } })
      await tx.compensation_voucher.deleteMany({ where: { refund_id: { in: refundIds } } })
      await tx.refund_line.deleteMany({ where: { payment_id: { in: ids } } })
      await tx.refund.deleteMany({ where: { payment_id: { in: ids } } })
      await tx.payment_attempt.deleteMany({ where: { payment_id: { in: ids } } })
      await tx.payment_line.deleteMany({ where: { payment_id: { in: ids } } })
      await tx.payment.deleteMany({ where: { id: { in: ids } } })
    })
    return { removed: ids.length }
  }
}
