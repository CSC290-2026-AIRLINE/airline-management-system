// PaymentEventsService: handles the callback F5 posts to
// /payment-events when a payment completes.
//
// F5 may deliver the same event twice (a retry, a duplicate webhook),
// so every transition is guarded by a conditional update: the first
// event wins, the second one finds nothing to do. The guard is the
// order's status, plus paid_at for the late-payment refund.

import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '../../../db/generated/prisma/client'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { SystemClock } from '../common/clock'
import { FlightContextService } from '../common/flight-context.service'
import { StubPaymentsService } from '../common/cross-module-ports'
import { toNumber } from '../common/mapping'
import { ReservationsService } from '../common/reservations.service'
import { parsePaymentEvent, type PaymentEventInput } from './dto/payment-event.dto'
import { decidePaymentEvent } from './payment-event-rules'

export interface PaymentEventResult {
  orderId: string
  status: string
  paymentStatus: 'none' | 'pending' | 'paid' | 'failed'
  // True when this call moved the order; false when the event was a
  // duplicate of one already applied.
  applied: boolean
  refunded: boolean
}

@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SystemClock,
    private readonly audit: AuditService,
    private readonly payments: StubPaymentsService,
    private readonly flightContext: FlightContextService,
    private readonly reservations: ReservationsService,
  ) {}

  async handle(raw: unknown): Promise<PaymentEventResult> {
    const event = parsePaymentEvent(raw)
    const order = await this.findOrder(event)
    if (!order) throw new ApiErrorException('NOT_FOUND', 'No order matches this payment event.', 404)

    const now = this.clock.now()
    const decision = decidePaymentEvent(
      { id: order.id, status: order.status, expiresAt: order.expires_at, paidAt: order.paid_at },
      event,
      now,
    )

    if (decision.action === 'ignore') {
      return {
        orderId: order.id,
        status: order.status,
        paymentStatus: this.paymentStatus(order.status, order.payment_id),
        applied: false,
        refunded: false,
      }
    }

    const warehouseId = await this.warehouseFor(order.flight_id)

    if (decision.action === 'confirm') {
      const changed = await this.db.$transaction(async (tx) => {
        const updated = await tx.product_order.updateMany({
          where: { id: order.id, status: 'pending_payment' },
          data: { status: 'confirmed', paid_at: now },
        })
        if (updated.count !== 1) return false
        await this.audit.record(
          {
            actorType: 'system',
            actorId: null,
            actorRole: 'f5',
            sourceFeature: 'onboard-products',
            action: 'product_order.update',
            entityType: 'product_order',
            entityId: order.id,
            summary: `Payment ${event.paymentId ?? 'unknown'} received for order ${order.id}.`,
          },
          tx,
        )
        return true
      })
      if (!changed) return this.unchanged(order.id, order.status, order.payment_id)
      return {
        orderId: order.id,
        status: 'confirmed',
        paymentStatus: 'paid',
        applied: true,
        refunded: false,
      }
    }

    if (decision.action === 'fail') {
      const changed = await this.db.$transaction(async (tx) => {
        const updated = await tx.product_order.updateMany({
          where: { id: order.id, status: 'pending_payment' },
          data: { status: 'cancelled', cancelled_at: now },
        })
        if (updated.count !== 1) return false
        await tx.product_order_line.updateMany({
          where: { product_order_id: order.id, deleted_at: null },
          data: { deleted_at: now },
        })
        await this.releaseStock(tx, order, warehouseId, now)
        await this.audit.record(
          {
            actorType: 'system',
            actorId: null,
            actorRole: 'f5',
            sourceFeature: 'onboard-products',
            action: 'product_order.cancel',
            entityType: 'product_order',
            entityId: order.id,
            summary: `Payment for order ${order.id} failed; the stock was released.`,
          },
          tx,
        )
        return true
      })
      if (!changed) return this.unchanged(order.id, order.status, order.payment_id)
      return {
        orderId: order.id,
        status: 'cancelled',
        paymentStatus: 'failed',
        applied: true,
        refunded: false,
      }
    }

    // The money arrived too late: expire the order, release the stock
    // and ask F5 to refund. paid_at is the guard that makes a second
    // copy of the same event a no-op.
    const changed = await this.db.$transaction(async (tx) => {
      const updated = await tx.product_order.updateMany({
        where: { id: order.id, paid_at: null },
        data: decision.expireOrder ? { status: 'expired', paid_at: now } : { paid_at: now },
      })
      if (updated.count !== 1) return false
      if (decision.expireOrder) {
        await tx.product_order_line.updateMany({
          where: { product_order_id: order.id, deleted_at: null },
          data: { deleted_at: now },
        })
        await this.releaseStock(tx, order, warehouseId, now)
      }
      await this.audit.record(
        {
          actorType: 'system',
          actorId: null,
          actorRole: 'f5',
          sourceFeature: 'onboard-products',
          action: 'product_order.update',
          entityType: 'product_order',
          entityId: order.id,
          summary: `Payment for order ${order.id} arrived after the order closed; it is refunded.`,
        },
        tx,
      )
      return true
    })

    if (!changed) {
      throw this.latePaymentError(order.id, false, true)
    }

    let refunded = false
    if (order.payment_id) {
      refunded = await this.payments.refund(order.payment_id, toNumber(order.total_amount), 'payment received after the order closed')
    }
    this.logger.warn(`Payment ${event.paymentId ?? 'unknown'} arrived after order ${order.id} closed; refunded.`)
    throw this.latePaymentError(order.id, refunded)
  }

  // -- helpers --------------------------------------------------------------

  private async findOrder(event: PaymentEventInput) {
    const byReference = await this.db.product_order.findUnique({
      where: { id: event.reference },
      include: { product_order_line: true },
    })
    if (byReference) return byReference
    if (!event.paymentId) return null
    return this.db.product_order.findFirst({
      where: { payment_id: event.paymentId },
      include: { product_order_line: true },
    })
  }

  private async warehouseFor(flightId: string): Promise<string | null> {
    try {
      return (await this.flightContext.warehouseForFlight(flightId)).id
    } catch {
      return null
    }
  }

  private async releaseStock(
    tx: Prisma.TransactionClient,
    order: { id: string; flight_id: string; product_order_line: Array<{ product_id: string; quantity: number }> },
    warehouseId: string | null,
    now: Date,
  ): Promise<void> {
    if (!warehouseId) return
    const byProduct = new Map<string, number>()
    for (const line of order.product_order_line) {
      byProduct.set(line.product_id, (byProduct.get(line.product_id) ?? 0) + line.quantity)
    }
    for (const [productId, quantity] of byProduct) {
      await this.reservations.release(tx, {
        warehouseId,
        productId,
        quantity,
        orderId: order.id,
        flightId: order.flight_id,
        occurredAt: now,
      })
    }
  }

  private latePaymentError(orderId: string, refunded = false, duplicate = false): ApiErrorException {
    return new ApiErrorException('PAYMENT_AFTER_EXPIRY', 'The payment arrived after the order closed, so it has been refunded.', 409, {
      orderId,
      refunded,
      duplicate,
    })
  }

  private unchanged(orderId: string, status: string, paymentId: string | null): PaymentEventResult {
    return {
      orderId,
      status,
      paymentStatus: this.paymentStatus(status, paymentId),
      applied: false,
      refunded: false,
    }
  }

  private paymentStatus(status: string, paymentId: string | null): PaymentEventResult['paymentStatus'] {
    if (status === 'confirmed') return paymentId ? 'paid' : 'none'
    if (status === 'pending_payment') return 'pending'
    if (status === 'cancelled' || status === 'expired') return 'failed'
    return 'none'
  }
}
