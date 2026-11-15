import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import {
  CancelVoucherDto,
  CheckoutDto,
  CompensationDto,
  DecideRefundDto,
  PaymentSearchQueryDto,
  PostingsQueryDto,
  RefundQueueQueryDto,
  StaffRefundDto,
  VoucherQueryDto,
} from '../dto/payments.dto'
import { CrewPayService } from '../crew-pay/crew-pay.service'
import { PaymentsStaffGuard, StaffCaller, type PaymentsStaff } from '../guards/payments-staff.guard'
import { toCents } from '../money'
import { PaymentErrorCode, paymentError } from '../payments.errors'
import { paymentsValidationPipe } from '../payments.pipes'
import { CheckoutService } from '../services/checkout.service'
import { PaymentEngineService } from '../services/payment-engine.service'
import { RefundService } from '../services/refund.service'
import { FinancePostingService } from '../services/support.services'
import { VoucherService } from '../services/voucher.service'

/** Staff routes (S). The guard checks the caller is active staff; admin-only steps are checked in the services. */
@Controller('staff')
@UseGuards(PaymentsStaffGuard)
@UsePipes(paymentsValidationPipe)
export class StaffPaymentsController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly engine: PaymentEngineService,
    private readonly refunds: RefundService,
    private readonly vouchers: VoucherService,
    private readonly postings: FinancePostingService,
    private readonly crewPay: CrewPayService,
  ) {}

  /** A booking made by staff: the payer is the booking's customer. */
  @Post('checkout')
  create(@StaffCaller() staff: PaymentsStaff, @Body() dto: CheckoutDto, @Headers('idempotency-key') key: string) {
    return this.checkout.create(staff, {
      bookingReference: dto.booking_reference,
      cargoBookingId: dto.cargo_booking_id,
      voucherCode: dto.voucher_code,
      idempotencyKey: key,
    })
  }

  @Get('payments')
  search(@Query() query: PaymentSearchQueryDto) {
    return this.checkout.search(query.q)
  }

  @Post('payments/:id/retry-capture')
  @HttpCode(200)
  async retryCapture(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.engine.capture(id)
    return { ...result, payment: await this.checkout.view(id) }
  }

  @Get('refunds')
  queue(@Query() query: RefundQueueQueryDto) {
    return this.refunds.listForStaff(query.status)
  }

  @Post('refunds')
  createRefund(@StaffCaller() staff: PaymentsStaff, @Body() dto: StaffRefundDto) {
    return this.refunds.createByStaff(staff, {
      paymentId: dto.payment_id,
      reason: dto.reason,
      method: dto.method,
      amountCents: toCents(dto.amount),
      paymentLineId: dto.payment_line_id,
      waiveFee: dto.waive_fee,
      note: dto.note,
    })
  }

  /** Approve (admin when outside policy, written to audit_log), reject (note required), or reissue as a voucher. */
  @Put('refunds/:id')
  decide(@StaffCaller() staff: PaymentsStaff, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideRefundDto) {
    return this.refunds.decide(staff, id, dto.action, dto.note)
  }

  @Get('compensations')
  pendingCompensations() {
    return this.refunds.pendingCompensations()
  }

  @Post('compensations')
  payCompensation(@StaffCaller() staff: PaymentsStaff, @Body() dto: CompensationDto) {
    return this.refunds.payCompensation(staff, {
      caseCompensationId: dto.case_compensation_id,
      form: dto.form,
      paymentId: dto.payment_id,
      amountCents: dto.amount === undefined ? undefined : toCents(dto.amount),
    })
  }

  @Get('vouchers')
  listVouchers(@Query() query: VoucherQueryDto) {
    return this.vouchers.listForStaff({ status: query.status, customerId: query.customer_id, code: query.code })
  }

  @Put('vouchers/:id')
  cancelVoucher(@StaffCaller() staff: PaymentsStaff, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelVoucherDto) {
    return this.vouchers.cancel(staff, id, dto.reason)
  }

  /** Stalled captures, failed refunds and (5c) failed crew payouts. */
  @Get('payment-exceptions')
  async exceptions() {
    const [money, failedPayouts] = await Promise.all([this.refunds.exceptions(), this.crewPay.failedPayouts()])
    return { ...money, failed_payouts: failedPayouts }
  }

  /** The finance journal by occurred_at range. Finance role, or admin until a finance role is seeded. */
  @Get('finance/postings')
  financePostings(@StaffCaller() staff: PaymentsStaff, @Query() query: PostingsQueryDto) {
    if (!staff.isAdmin && staff.roleCode !== 'finance') {
      throw new ForbiddenException(paymentError(PaymentErrorCode.ADMIN_ONLY, 'Finance or admin role required'))
    }
    return this.postings.read(new Date(query.from), new Date(query.to), query.type)
  }
}
