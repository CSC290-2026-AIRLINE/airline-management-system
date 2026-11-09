import { Body, Controller, Get, HttpCode, Param, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { PaymentsCheckoutService } from './payments-checkout.service'
import { PaymentExceptionsQueryDto } from './dto/payment-exceptions-query.dto'
import { StaffPaymentActionDto } from './dto/staff-payment-action.dto'
import { StaffPaymentQueryDto } from './dto/staff-payment-query.dto'
import type { ListDto, StaffPaymentDetailDto, StaffPaymentSummaryDto } from './dto/payments-checkout.types'

/**
 * `/api/staff/payments` and `/api/staff/payment-exceptions` — the staff payment lookup and exception list.
 *
 * There is no staff guard on this controller, and there cannot be one yet: the access token carries no user type, so
 * the backend cannot tell a staff member from a customer. Staff roles are enforced by Feature 15's admin console, and
 * the Dev Leads have to decide how this route is protected before it goes live. Until then the global `JwtAuthGuard`
 * is the only gate — a valid token is enough.
 */
@Controller('staff')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class StaffPaymentsController {
  constructor(private readonly svc: PaymentsCheckoutService) {}

  /** The payment lookup, with the frames' status filters. */
  @Get('payments')
  listPayments(@Query() query: StaffPaymentQueryDto): Promise<ListDto<StaffPaymentSummaryDto>> {
    return this.svc.listStaffPayments(query)
  }

  /** One payment, with the capture-stalled panel. */
  @Get('payments/:id')
  getPayment(@Param('id') id: string): StaffPaymentDetailDto {
    return this.svc.getStaffPayment(id)
  }

  /**
   * The exception list.
   *
   * `tab` is `needs_action`, `queued`, `resolved` or `all` — the four views the frames show.
   */
  @Get('payment-exceptions')
  listExceptions(@Query() query: PaymentExceptionsQueryDto): Promise<ListDto<StaffPaymentSummaryDto>> {
    return this.svc.listPaymentExceptions(query.tab ?? 'all')
  }

  /**
   * Retries a capture that stalled.
   *
   * The schema says it directly: "the seller confirmed, but capture failed capture_retry_limit times. The payment
   * stays authorised and is on the staff exception list; staff retry the capture."
   */
  @Post('payments/:id/retry-capture')
  @HttpCode(200)
  async retryCapture(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffPaymentActionDto,
  ): Promise<StaffPaymentDetailDto> {
    await this.svc.retryCapture(id, user.id, dto.note ?? null)
    return this.svc.getStaffPayment(id)
  }

  /**
   * Releases an authorisation without charging.
   *
   * Feature 3b calls the same thing in process when it cancels a booking; staff call this when they cancel a
   * capture-stalled purchase.
   */
  @Post('payments/:id/void')
  @HttpCode(200)
  async voidPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffPaymentActionDto,
  ): Promise<StaffPaymentDetailDto> {
    await this.svc.voidPayment(id, dto.note ?? 'voided_by_staff', user.id)
    return this.svc.getStaffPayment(id)
  }
}
