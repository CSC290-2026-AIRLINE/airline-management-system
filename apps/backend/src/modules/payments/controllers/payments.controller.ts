import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CheckoutDto, RefundRequestDto, ValidateVoucherDto } from '../dto/payments.dto'
import { paymentsValidationPipe } from '../payments.pipes'
import { CheckoutService } from '../services/checkout.service'
import { RefundService } from '../services/refund.service'
import { CallerService } from '../services/support.services'
import { VoucherService } from '../services/voucher.service'
import { toCents } from '../money'

/**
 * Customer routes (C), plus the ones staff share (C, S). Ownership is checked in the services: a customer reaches only
 * their own payments, refunds and vouchers, and any other id answers 404.
 */
@Controller()
@UsePipes(paymentsValidationPipe)
export class PaymentsController {
  constructor(
    private readonly callers: CallerService,
    private readonly checkout: CheckoutService,
    private readonly refunds: RefundService,
    private readonly vouchers: VoucherService,
  ) {}

  /** Creates the payment and its hosted session. Idempotency-Key header required. */
  @Post('checkout')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto, @Headers('idempotency-key') key: string) {
    const caller = await this.callers.customer(user.id)
    return this.checkout.create(caller, {
      bookingReference: dto.booking_reference,
      cargoBookingId: dto.cargo_booking_id,
      voucherCode: dto.voucher_code,
      idempotencyKey: key,
    })
  }

  /** What Review & Pay shows: the lines, the total and the voucher split. Creates nothing. */
  @Post('checkout/preview')
  @HttpCode(200)
  async preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    const caller = await this.callers.resolve(user.id)
    return this.checkout.preview(caller, {
      bookingReference: dto.booking_reference,
      cargoBookingId: dto.cargo_booking_id,
      voucherCode: dto.voucher_code,
    })
  }

  @Post('payments/:id/attempts')
  async newAttempt(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkout.newAttempt(await this.callers.resolve(user.id), id)
  }

  /** The confirmation page polls this until a webhook has moved the status. */
  @Get('payments/:id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkout.get(await this.callers.resolve(user.id), id)
  }

  @Get('payments/:id/receipt')
  async receipt(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkout.receipt(await this.callers.resolve(user.id), id)
  }

  @Get('customers/me/payments')
  async myPayments(@CurrentUser() user: AuthenticatedUser) {
    return this.checkout.listMine((await this.callers.customer(user.id)).customerId)
  }

  /** Shows a code's value and what would be forfeited. Reserves nothing. */
  @Post('vouchers/validate')
  @HttpCode(200)
  async validateVoucher(@CurrentUser() user: AuthenticatedUser, @Body() dto: ValidateVoucherDto) {
    const caller = await this.callers.customer(user.id)
    let total: number | undefined
    if (dto.booking_reference || dto.cargo_booking_id) {
      const preview = await this.checkout.preview(caller, { bookingReference: dto.booking_reference, cargoBookingId: dto.cargo_booking_id })
      total = toCents(preview.amount_total)
    }
    return this.vouchers.validate(caller.customerId, dto.code, total)
  }

  @Get('customers/me/vouchers')
  async myVouchers(@CurrentUser() user: AuthenticatedUser) {
    return this.vouchers.listMine((await this.callers.customer(user.id)).customerId)
  }

  @Post('refund-requests')
  async requestRefund(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefundRequestDto) {
    const caller = await this.callers.customer(user.id)
    return this.refunds.requestByCustomer(caller, { paymentId: dto.payment_id, paymentLineId: dto.payment_line_id, note: dto.note })
  }

  @Get('customers/me/refunds')
  async myRefunds(@CurrentUser() user: AuthenticatedUser) {
    return this.refunds.listMine((await this.callers.customer(user.id)).customerId)
  }

  @Get('refunds/:id')
  async refund(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.refunds.get(await this.callers.resolve(user.id), id)
  }
}
