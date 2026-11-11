import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { PaymentsRefundsService } from './payments-refunds.service'
import { IssueCompensationDto, RefundDecisionDto, VoidVoucherDto } from './dto/refund-action.dto'
import { CompensationQueryDto, RefundQueueQueryDto } from './dto/refund-query.dto'
import type { CompensationEntryDto, CompensationListDto, RefundDetailDto, RefundQueueListDto } from './dto/payments-refunds.types'
import { RequireScreen } from './guards/require-screen.decorator'
import { ScreenAccessGuard } from './guards/screen-access.guard'

/**
 * `/api/staff/refunds` and `/api/staff/compensation` — the staff refund queue and the compensation page.
 *
 * `ScreenAccessGuard` is the only thing between a signed-in caller and a refund. The access token carries no user type,
 * so the guard asks the admin console instead: an admin grants `f5.refund_queue` / `f5.compensation_vouchers` to a role
 * on the Role access tab, and a caller with no staff account holds no grants, so a customer's token is refused here too.
 */
@Controller('staff')
@UseGuards(ScreenAccessGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class StaffRefundsController {
  constructor(private readonly svc: PaymentsRefundsService) {}

  /** The refund queue, with the frames' tabs, search box and tab counts. */
  @Get('refunds')
  @RequireScreen('f5.refund_queue')
  listRefunds(@Query() query: RefundQueueQueryDto): Promise<RefundQueueListDto> {
    return this.svc.listQueue(query)
  }

  /** One refund, by id or by `REF-0121`. */
  @Get('refunds/:id')
  @RequireScreen('f5.refund_queue')
  getRefund(@Param('id') id: string): Promise<RefundDetailDto> {
    return this.svc.getStaffRefund(id)
  }

  /** Approves to the card, approves as a voucher, or rejects. The reason is required and goes to the customer. */
  @Post('refunds/:id/decision')
  @RequireScreen('f5.refund_queue')
  @HttpCode(200)
  decide(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RefundDecisionDto): Promise<RefundDetailDto> {
    return this.svc.decide(id, user.id, dto)
  }

  /** The compensation history: vouchers and card refunds. */
  @Get('compensation')
  @RequireScreen('f5.compensation_vouchers')
  listCompensation(@Query() query: CompensationQueryDto): Promise<CompensationListDto> {
    return this.svc.listCompensation(query)
  }

  /** Issues a voucher or a card refund to a booking. */
  @Post('compensation')
  @RequireScreen('f5.compensation_vouchers')
  @HttpCode(201)
  issue(@CurrentUser() user: AuthenticatedUser, @Body() dto: IssueCompensationDto): Promise<CompensationEntryDto> {
    return this.svc.issueCompensation(user.id, dto)
  }

  /** Voids a voucher that has not been used. The id is the voucher's id or its code. */
  @Post('vouchers/:id/void')
  @RequireScreen('f5.compensation_vouchers')
  @HttpCode(200)
  voidVoucher(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: VoidVoucherDto): Promise<CompensationEntryDto> {
    return this.svc.voidVoucher(id, user.id, dto)
  }
}
