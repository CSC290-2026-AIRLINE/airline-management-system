import { Body, Controller, Get, HttpCode, Param, Post, Query, UsePipes, ValidationPipe, UseFilters } from '@nestjs/common'
import { PaymentsErrorFilter } from '@backend/modules/payments-checkout/payments-error.filter'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { PaymentsRefundsService } from './payments-refunds.service'
import { CreateRefundRequestDto, ValidateVoucherDto } from './dto/refund-action.dto'
import { MyRefundQueryDto } from './dto/refund-query.dto'
import type { MyRefundDto, MyRefundListDto, MyVoucherListDto, RefundableListDto, VoucherValidationDto } from './dto/payments-refunds.types'

const validation = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })

/**
 * `/api/refunds` — the signed-in customer's own refunds.
 *
 * The global `JwtAuthGuard` already requires a bearer token, so there is no auth decorator on the class. The refunds are
 * filtered by the token's user in the service, so one customer can never read another's refund.
 */
@Controller('refunds')
@UseFilters(PaymentsErrorFilter)
@UsePipes(validation)
export class RefundsController {
  constructor(private readonly svc: PaymentsRefundsService) {}

  /** The customer's refunds, newest first, with the counts the frames show on the tabs. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: MyRefundQueryDto): Promise<MyRefundListDto> {
    return this.svc.listMyRefunds(user.id, query)
  }

  /** The customer's captured payments and the lines they can still ask money back for. It sits before `:id`, so "refundable" is not read as an id. */
  @Get('refundable')
  refundable(@CurrentUser() user: AuthenticatedUser): Promise<RefundableListDto> {
    return this.svc.listMyRefundable(user.id)
  }

  /** One refund. 404 when it is not the customer's. */
  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<MyRefundDto> {
    return this.svc.getMyRefund(user.id, id)
  }

  /** The "Request a refund" dialog. The request waits in the staff queue until a person decides it. */
  @Post()
  @HttpCode(201)
  request(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRefundRequestDto): Promise<MyRefundDto> {
    return this.svc.requestRefund(user.id, dto)
  }
}

/** `/api/vouchers` — the signed-in customer's own vouchers. */
@Controller('vouchers')
@UseFilters(PaymentsErrorFilter)
@UsePipes(validation)
export class VouchersController {
  constructor(private readonly svc: PaymentsRefundsService) {}

  /** The customer's vouchers, the usable ones first. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<MyVoucherListDto> {
    return this.svc.listMyVouchers(user.id)
  }

  /** Checks a code and shows its value and what would be forfeited at a given total. Reserves nothing. */
  @Post('validate')
  @HttpCode(200)
  validate(@CurrentUser() user: AuthenticatedUser, @Body() dto: ValidateVoucherDto): Promise<VoucherValidationDto> {
    return this.svc.validateVoucher(user.id, dto)
  }
}

/** `/api/refund-requests` — the spec's name for the "Request a refund" dialog (also `POST /api/refunds`). */
@Controller('refund-requests')
@UseFilters(PaymentsErrorFilter)
@UsePipes(validation)
export class RefundRequestsController {
  constructor(private readonly svc: PaymentsRefundsService) {}

  @Post()
  @HttpCode(201)
  request(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRefundRequestDto): Promise<MyRefundDto> {
    return this.svc.requestRefund(user.id, dto)
  }
}

/** `/api/customers/me/refunds` and `/vouchers` — the spec's names for the customer's own lists (also `GET /api/refunds`, `/api/vouchers`). */
@Controller('customers/me')
@UseFilters(PaymentsErrorFilter)
@UsePipes(validation)
export class CustomerRefundsController {
  constructor(private readonly svc: PaymentsRefundsService) {}

  @Get('refunds')
  refunds(@CurrentUser() user: AuthenticatedUser, @Query() query: MyRefundQueryDto): Promise<MyRefundListDto> {
    return this.svc.listMyRefunds(user.id, query)
  }

  @Get('vouchers')
  vouchers(@CurrentUser() user: AuthenticatedUser): Promise<MyVoucherListDto> {
    return this.svc.listMyVouchers(user.id)
  }
}
