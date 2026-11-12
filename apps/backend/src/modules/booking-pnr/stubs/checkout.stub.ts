import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  type BookingClock,
  type BookingTransaction,
  type ChargeRequest,
  type CheckoutPort,
  type PaymentResult,
} from '../contracts'

/** Local checkout stand-in only. A captured fake payment satisfies the seat payment foreign key. */
@Injectable()
export class CheckoutStub implements CheckoutPort {
  constructor(
    private readonly db: DbService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}
  async charge(request: ChargeRequest, transaction?: BookingTransaction): Promise<PaymentResult> {
    if (process.env.NODE_ENV === 'production') throw new BookingError('SEAT_NOT_ALLOWED', 'Development checkout is unavailable', 404)
    if (!Number.isFinite(request.amount) || request.amount < 0 || request.currency !== 'USD' || !request.idempotencyKey)
      throw new BookingError('SEAT_NOT_ALLOWED', 'Invalid seat payment', 422)
    const charge = async (tx: BookingTransaction): Promise<PaymentResult> => {
      const booking = await tx.booking.findUnique({
        where: { id: request.bookingId },
        select: { customer_id: true, currency: true, status: true },
      })
      if (!booking || booking.status !== 'confirmed' || booking.currency !== request.currency)
        throw new BookingError('BOOKING_CLOSED', 'Booking is not available for seat payment')
      const existing = await tx.payment.findFirst({
        where: { payer_customer_id: booking.customer_id, idempotency_key: request.idempotencyKey },
      })
      if (existing) {
        if (
          existing.booking_id !== request.bookingId ||
          existing.purchase_ref !== (request.purchaseRef ?? `booking:${request.bookingId}`) ||
          existing.status !== 'captured' ||
          Number(existing.amount_total) !== request.amount ||
          existing.currency !== request.currency
        )
          throw new BookingError('SEAT_NOT_ALLOWED', 'Payment attempt does not match the seat purchase')
        return { paymentId: existing.id, amount: Number(existing.amount_total), currency: existing.currency }
      }
      const now = this.clock.now()
      const payment = await tx.payment.create({
        data: {
          source_feature: 3,
          purchase_ref: request.purchaseRef ?? `booking:${request.bookingId}`,
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
      return { paymentId: payment.id, amount: request.amount, currency: request.currency }
    }
    return transaction ? charge(transaction) : this.db.$transaction(charge)
  }
}
