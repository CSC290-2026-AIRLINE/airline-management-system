import { Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { ChargeRequest, CheckoutPort, PaymentResult } from '@backend/modules/booking-pnr/contracts'
import { PaymentErrorCode, paymentFailure } from '@backend/modules/payments-crew-pay/payments.errors'
import { messageAmount, purchaseReferenceOf, queueCustomerMessage, receiptNumberOf } from './customer-messages'
import { capturedPostings, writePostings } from './finance-journal'

type Tx = Parameters<Parameters<DbService['$transaction']>[0]>[0]

/**
 * Feature 5's answer to Feature 3's `CheckoutPort`: a charge for something bought after the booking (a paid seat, travel
 * insurance), made inside Feature 3's own transaction, which expects the payment to be captured when `charge` returns.
 * It replaces 3's `CheckoutStub`.
 *
 * Only the **fake provider** can capture on the spot: a real card needs the customer on the provider's page, which a call
 * from inside another feature's transaction cannot offer. So, as the stub did, it records a captured `fake` payment and
 * refuses in production (`PROVIDER_UNAVAILABLE`). What 5a adds over the stub is the accounting a real payment has: the
 * right line type (`seat_fee`, or the line Feature 3 names), a receipt, and the journal rows, all in the caller's
 * transaction so they commit or roll back with the seat.
 *
 * TODO: a real card charge for add-ons is a hosted checkout of its own (`purchase_ref` `seat_assignment:<id>`), which needs
 * Feature 3's seat flow to wait for the payment instead of charging inside its transaction.
 */
@Injectable()
export class BookingChargeAdapter implements CheckoutPort {
  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
  ) {}

  async charge(request: ChargeRequest, transaction?: Tx): Promise<PaymentResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        paymentFailure(PaymentErrorCode.PROVIDER_UNAVAILABLE, 'Add-ons cannot be charged inside a booking here; they are paid at checkout'),
      )
    }
    if (!Number.isFinite(request.amount) || request.amount < 0 || !/^[A-Z]{3}$/.test(request.currency) || !request.idempotencyKey) {
      throw new UnprocessableEntityException(paymentFailure(PaymentErrorCode.PAYMENT_NOT_PAYABLE, 'Invalid add-on payment'))
    }
    return transaction ? this.record(transaction, request) : this.db.$transaction((tx) => this.record(tx, request))
  }

  /** The coupon a `seat_assignment:<id>` purchase is for, or null when the reference names something else. */
  private async couponOfSeat(tx: Tx, purchaseRef: string): Promise<string | null> {
    const id = /^seat_assignment:([0-9a-f-]{36})$/i.exec(purchaseRef)?.[1]
    if (!id) return null
    return (await tx.seat_assignment.findUnique({ where: { id }, select: { booking_coupon_id: true } }))?.booking_coupon_id ?? null
  }

  private async record(tx: Tx, request: ChargeRequest): Promise<PaymentResult> {
    const booking = await tx.booking.findUnique({
      where: { id: request.bookingId },
      select: { customer_id: true, currency: true, status: true },
    })
    if (!booking || booking.status !== 'confirmed' || booking.currency !== request.currency) {
      throw new UnprocessableEntityException(
        paymentFailure(PaymentErrorCode.PAYMENT_NOT_PAYABLE, 'Booking is not available for this payment'),
      )
    }
    const purchaseRef = request.purchaseRef ?? `booking:${request.bookingId}`
    const existing = await tx.payment.findFirst({
      where: { payer_customer_id: booking.customer_id, idempotency_key: request.idempotencyKey },
    })
    if (existing) {
      // The same key must mean the same purchase.
      if (
        existing.booking_id !== request.bookingId ||
        existing.purchase_ref !== purchaseRef ||
        existing.status !== 'captured' ||
        Number(existing.amount_total) !== request.amount ||
        existing.currency !== request.currency
      ) {
        throw new UnprocessableEntityException(
          paymentFailure(PaymentErrorCode.PAYMENT_NOT_PAYABLE, 'Payment attempt does not match the purchase'),
        )
      }
      return { paymentId: existing.id, amount: Number(existing.amount_total), currency: existing.currency }
    }

    const now = this.clock.now()
    const payment = await tx.payment.create({
      data: {
        source_feature: 3,
        purchase_ref: purchaseRef,
        booking_id: request.bookingId,
        payer_customer_id: booking.customer_id,
        idempotency_key: request.idempotencyKey,
        provider: request.amount === 0 ? 'none' : 'fake',
        status: 'captured',
        currency: request.currency,
        amount_total: request.amount,
        card_amount: request.amount,
        started_at: now,
        expires_at: new Date(now.getTime() + 300_000),
        authorised_at: now,
        captured_at: now,
        updated_at: now,
      },
      select: { id: true },
    })
    if (request.amount > 0) {
      // A seat bought after booking is a `seat_fee` line on the seat's coupon (the schema ties it to one, so a flight
      // cancellation finds it); Feature 3 names any other line itself (travel insurance).
      const couponId = request.line ? null : await this.couponOfSeat(tx, purchaseRef)
      const lineType = request.line?.lineType ?? (couponId ? 'seat_fee' : null)
      if (lineType) {
        await tx.payment_line.create({
          data: {
            payment_id: payment.id,
            booking_id: request.bookingId,
            booking_coupon_id: couponId,
            line_type: lineType,
            source_ref: request.line?.sourceRef ?? purchaseRef,
            description: request.line?.description ?? 'Seat selection',
            amount: request.amount,
          },
        })
      }
      const payer = await tx.customer.findUnique({
        where: { id: booking.customer_id },
        select: { passenger: { select: { first_name: true, last_name: true } } },
      })
      const name = payer?.passenger ? `${payer.passenger.first_name} ${payer.passenger.last_name}`.trim() : ''
      await tx.receipt.create({
        data: {
          payment_id: payment.id,
          document_type: 'receipt',
          document_number: `RCPT-${payment.id.slice(-6).toUpperCase()}`,
          amount: request.amount,
          billing_name: name || null,
          issued_at: now,
        },
      })
      await writePostings(
        tx,
        capturedPostings({
          id: payment.id,
          currency: request.currency,
          provider: 'fake',
          amount_total: request.amount,
          voucher_amount: 0,
          voucher_id: null,
          provider_fee: null,
          captured_at: now,
          lines: [{ line_type: lineType ?? 'seat_fee', amount: request.amount }],
        }),
      )
      await queueCustomerMessage(tx, {
        type: 'payment_received',
        sourceId: payment.id,
        customerId: booking.customer_id,
        at: now,
        placeholders: {
          reference: await purchaseReferenceOf(tx, payment.id),
          amount: messageAmount(request.amount, request.currency),
          document_number: receiptNumberOf({ id: payment.id, source_feature: 3 }),
        },
      })
    }
    return { paymentId: payment.id, amount: request.amount, currency: request.currency }
  }
}
