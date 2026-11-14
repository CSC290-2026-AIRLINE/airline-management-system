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

    const payment = await this.db.payment.create({
      data: {
        source_feature: 17,
        purchase_ref: booking.booking_ref,
        payer_customer_id: customerId,
        cargo_booking_id: booking.id,
        idempotency_key: `test-cargo-${booking.booking_ref}`,
        status: 'captured',
        provider: 'fake',
        currency: booking.currency,
        amount_total: charge,
        voucher_amount: 0,
        card_amount: charge,
        started_at: now,
        expires_at: new Date(now.getTime() + 3_600_000),
        authorised_at: now,
        captured_at: now,
      },
    })

    const result = await this.bookings.confirmCargoBooking(booking.booking_ref, payment.id, charge)
    return { awbNumber: result.awbNumber }
  }
}
