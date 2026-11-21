import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { PaymentsCheckoutService } from './payments-checkout.service'
import { PaymentExceptionsQueryDto } from './dto/payment-exceptions-query.dto'
import { StaffPaymentActionDto } from './dto/staff-payment-action.dto'
import { StaffPaymentQueryDto } from './dto/staff-payment-query.dto'
import type { PaymentProblemListDto, StaffPaymentDetailDto, StaffPaymentListDto } from './dto/payments-checkout.types'
import { RequireScreen } from './guards/require-screen.decorator'
import { ScreenAccessGuard } from './guards/screen-access.guard'

/**
 * `/api/staff/payments` and `/api/staff/payment-exceptions` — the staff payment lookup and exception list.
 *
 * `ScreenAccessGuard` is the only thing between a signed-in caller and a payment record. The access token carries no
 * user type, so the guard cannot tell a staff member from a customer by reading it — it asks the admin console
 * instead. Feature 15 owns the Role access matrix: an admin grants `f5.payment_lookup` / `f5.payment_exceptions` to a
 * role on the Role access tab, and `getMyScreens` answers with the codes the caller may open. A caller with no staff
 * account holds no grants, so a customer's token is refused here too.
 *
 * The lookup is read only. The frames say so on the page — "staff cannot edit a state by hand" — so the only write
 * routes here are the two actions the exception list offers.
 */
@Controller('staff')
@UseGuards(ScreenAccessGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class StaffPaymentsController {
  constructor(private readonly svc: PaymentsCheckoutService) {}

  /** The payment lookup, with the frames' status filters, search box and filter counts. */
  @Get('payments')
  @RequireScreen('f5.payment_lookup')
  listPayments(@Query() query: StaffPaymentQueryDto): Promise<StaffPaymentListDto> {
    return this.svc.listStaffPayments(query)
  }

  /** One payment, with its state history. Opening it is written to the audit trail as a sensitive view. */
  @Get('payments/:id')
  @RequireScreen('f5.payment_lookup')
  getPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<StaffPaymentDetailDto> {
    return this.svc.getStaffPayment(id, user.id)
  }

  /**
   * The exception list — a list of problems, not a list of payments.
   *
   * `tab` is `needs_action`, `queued`, `resolved` or `all` — the four views the frames show.
   */
  @Get('payment-exceptions')
  @RequireScreen('f5.payment_exceptions')
  listExceptions(@Query() query: PaymentExceptionsQueryDto): Promise<PaymentProblemListDto> {
    return this.svc.listPaymentProblems(query.tab ?? 'all')
  }

  /**
   * Retries a capture that stalled.
   *
   * The schema says it directly: "the seller confirmed, but capture failed capture_retry_limit times. The payment
   * stays authorised and is on the staff exception list; staff retry the capture." The id is the problem's id, which is
   * the payment's id.
   */
  @Post('payment-exceptions/:id/retry-capture')
  @RequireScreen('f5.payment_exceptions')
  @HttpCode(200)
  async retryCapture(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffPaymentActionDto,
  ): Promise<StaffPaymentDetailDto> {
    await this.svc.retryCapture(id, user.id, dto.note ?? null)
    /* Read back without an actor: the status change is already recorded, and this is not a second look at the payment. */
    return this.svc.getStaffPayment(id)
  }

  /**
   * Sends a payment to the finance ledger, for a posting the ledger did not accept.
   *
   * The id is the problem's id, which is the payment's id.
   */
  @Post('payment-exceptions/:id/send-posting')
  @RequireScreen('f5.payment_exceptions')
  @HttpCode(200)
  async sendPosting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffPaymentActionDto,
  ): Promise<StaffPaymentDetailDto> {
    await this.svc.sendFinancePosting(id, user.id, dto.note ?? null)
    return this.svc.getStaffPayment(id)
  }
}
