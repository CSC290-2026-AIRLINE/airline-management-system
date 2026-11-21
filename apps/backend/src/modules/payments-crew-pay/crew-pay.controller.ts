import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards, UsePipes } from '@nestjs/common'
import { PaymentsStaffGuard, StaffCaller, type PaymentsStaff } from './payments-staff.guard'
import { toCents } from './money'
import { paymentsValidationPipe } from './payments.pipes'
import { AdjustmentDto, ApprovePayRunDto, CreatePayRunDto } from './crew-pay.dto'
import { CrewPayService } from './crew-pay.service'

/** Crew pay (5c, stretch). Pay runs are finance work (S, finance); My Pay is the crew member's own read-only view. */
@Controller()
@UseGuards(PaymentsStaffGuard)
@UsePipes(paymentsValidationPipe)
export class CrewPayController {
  constructor(private readonly crewPay: CrewPayService) {}

  @Get('staff/pay-runs')
  list(@StaffCaller() staff: PaymentsStaff) {
    this.crewPay.assertFinance(staff)
    return this.crewPay.overview(staff)
  }

  @Post('staff/pay-runs')
  create(@StaffCaller() staff: PaymentsStaff, @Body() dto: CreatePayRunDto) {
    return this.crewPay.createRun(staff, dto.period_start.slice(0, 10), dto.period_end.slice(0, 10))
  }

  @Get('staff/pay-runs/:id')
  get(@StaffCaller() staff: PaymentsStaff, @Param('id', ParseUUIDPipe) id: string) {
    this.crewPay.assertFinance(staff)
    return this.crewPay.getRun(staff, id)
  }

  @Post('staff/pay-runs/:id/approve')
  @HttpCode(200)
  approve(@StaffCaller() staff: PaymentsStaff, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApprovePayRunDto) {
    return this.crewPay.approve(staff, id, dto.note)
  }

  @Post('staff/pay-runs/:id/pay')
  @HttpCode(200)
  pay(@StaffCaller() staff: PaymentsStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.crewPay.pay(staff, id)
  }

  @Post('staff/pay-runs/:id/cancel')
  @HttpCode(200)
  cancel(@StaffCaller() staff: PaymentsStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.crewPay.cancel(staff, id)
  }

  @Post('staff/payroll-lines/adjustments')
  addAdjustment(@StaffCaller() staff: PaymentsStaff, @Body() dto: AdjustmentDto) {
    return this.crewPay.addAdjustment(staff, {
      crewId: dto.crew_id,
      amountCents: toCents(dto.amount),
      description: dto.description,
      earnedOn: dto.earned_on?.slice(0, 10),
      pairingId: dto.pairing_id,
      payRunId: dto.pay_run_id,
    })
  }

  @Post('staff/payouts/:id/retry')
  @HttpCode(200)
  retryPayout(@StaffCaller() staff: PaymentsStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.crewPay.retryPayout(staff, id)
  }

  @Get('crew/me/pay')
  myPay(@StaffCaller() staff: PaymentsStaff) {
    return this.crewPay.myPay(staff)
  }
}
