// MOCK: replace with Feature 5a checkout
import { Controller, Param, ParseUUIDPipe, Post, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { DbService } from '@backend/db/db.service'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'
import { CargoBookingService } from './cargo-booking.service'
import { CargoCustomerService } from './cargo-customer.service'

@Controller('cargo')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CargoCustomerMockController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CargoCustomerService,
    private readonly bookings: CargoBookingService,
  ) {}

  @Post('bookings/:id/mock-pay')
  async mockPay(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: { id: string }) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    const booking = await this.db.cargo_booking.findUnique({
      where: { id },
      select: { id: true, customer_id: true, booking_ref: true, quoted_charge: true, currency: true, payment_id: true },
    })
    if (!booking || booking.customer_id !== customerId) {
      return { error: { code: 'NOT_FOUND', message: 'Booking not found' } }
    }
    if (booking.payment_id) {
      return { error: { code: 'ALREADY_CONFIRMED', message: 'Booking is already confirmed' } }
    }

    const charge = Number(booking.quoted_charge)
    const now = simNow()

    // Behave like Feature 5a: authorise, ask cargo to confirm, then capture on success or void on a refusal (hold expired, amount
    // changed, booking cancelled), so a failed confirm never leaves money marked as taken.
    const live = await this.db.payment.findFirst({
      where: { cargo_booking_id: booking.id, status: { in: ['authorised', 'captured'] } },
      select: { id: true, status: true },
    })
    const paymentId = live
      ? live.id
      : (
          await this.db.payment.create({
            data: {
              source_feature: 17,
              purchase_ref: booking.booking_ref,
              payer_customer_id: customerId,
              cargo_booking_id: booking.id,
              idempotency_key: `test-cargo-${booking.booking_ref}-${Date.now()}`,
              status: 'authorised',
              provider: 'fake',
              currency: booking.currency,
              amount_total: charge,
              voucher_amount: 0,
              card_amount: charge,
              started_at: now,
              expires_at: new Date(now.getTime() + 3_600_000),
              authorised_at: now,
            },
          })
        ).id

    let result: Awaited<ReturnType<CargoBookingService['confirmCargoBooking']>>
    try {
      result = await this.bookings.confirmCargoBooking(booking.booking_ref, paymentId, charge)
    } catch (e) {
      if (live?.status !== 'captured') {
        await this.db.payment.update({ where: { id: paymentId }, data: { status: 'voided', voided_at: simNow() } })
      }
      throw e
    }
    if (live?.status !== 'captured') {
      await this.db.payment.update({ where: { id: paymentId }, data: { status: 'captured', captured_at: simNow() } })
    }
    return { awbNumber: result.awbNumber }
  }
}
