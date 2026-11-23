import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { CLOCK } from './providers'
import type { ClockProvider, PaymentProvider } from './providers'

/**
 * Feature 6 writes the payment row itself: feature 5 has no service yet, so the row is a captured fake payment that
 * the passenger and the booking carry.
 */
@Injectable()
export class DbPayments implements PaymentProvider {
  constructor(
    private readonly db: DbService,
    @Inject(CLOCK) private readonly clock: ClockProvider,
  ) {}

  async charge(input: {
    amount: number
    currency: 'THB'
    purpose: 'seat' | 'excess_baggage'
    reference: string
    bookingId: string
  }): Promise<{ paymentId: string }> {
    // The purchase reference is unique per feature while the payment is live, so a retry finds the payment it made
    // the first time instead of failing on the unique index.
    const existing = await this.db.payment.findFirst({
      where: { source_feature: 6, purchase_ref: input.reference, status: { in: ['created', 'authorised', 'captured'] } },
    })
    if (existing) return { paymentId: existing.id }

    const booking = await this.db.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      select: { id: true, customer_id: true },
    })
    const now = this.clock.now()
    const row = await this.db.payment.create({
      data: {
        source_feature: 6,
        purchase_ref: input.reference,
        idempotency_key: input.reference,
        booking_id: booking.id,
        payer_customer_id: booking.customer_id,
        status: 'captured',
        provider: 'fake',
        currency: input.currency,
        amount_total: input.amount,
        card_amount: input.amount,
        started_at: now,
        expires_at: new Date(now.getTime() + 15 * 60_000),
        // A captured payment carries the moment it was authorised: the table checks the two together.
        authorised_at: now,
        captured_at: now,
        updated_at: now,
      },
    })
    return { paymentId: row.id }
  }
}
