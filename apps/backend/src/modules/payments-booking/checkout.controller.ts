import { Body, Controller, Headers, HttpCode, Post, UseFilters, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { RequireScreen } from '@backend/modules/payments-checkout/guards/require-screen.decorator'
import { ScreenAccessGuard } from '@backend/modules/payments-checkout/guards/screen-access.guard'
import { PaymentsErrorFilter } from '@backend/modules/payments-checkout/payments-error.filter'
import { BookingCheckoutService } from './booking-checkout.service'
import { CheckoutDto, type CheckoutResultDto } from './dto/checkout.dto'

@Controller('checkout')
@UseFilters(PaymentsErrorFilter)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CheckoutController {
  constructor(private readonly svc: BookingCheckoutService) {}

  /**
   * Pays for a held booking. `Idempotency-Key` makes a double click or a second tab the same checkout. Answers with the
   * hosted page's URL, or with the payment's state when no page is needed (a voucher that covers it, zero cash).
   */
  @Post()
  @HttpCode(200)
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CheckoutDto,
  ): Promise<CheckoutResultDto> {
    return this.svc.checkout(user.id, idempotencyKey, dto)
  }
}

/** `/api/staff/checkout` — the same checkout for a booking an agent made; the payer is the booking's customer. */
@Controller('staff/checkout')
@UseFilters(PaymentsErrorFilter)
@UseGuards(ScreenAccessGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class StaffCheckoutController {
  constructor(private readonly svc: BookingCheckoutService) {}

  @Post()
  @RequireScreen('f5.payment_lookup')
  @HttpCode(200)
  checkout(@Headers('idempotency-key') idempotencyKey: string | undefined, @Body() dto: CheckoutDto): Promise<CheckoutResultDto> {
    return this.svc.staffCheckout(idempotencyKey, dto)
  }
}
