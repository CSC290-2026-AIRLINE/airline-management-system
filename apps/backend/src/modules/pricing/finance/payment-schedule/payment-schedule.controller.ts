import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreatePaymentScheduleDto } from './dto/create-payment-schedule.dto'
import { ListPaymentSchedulesDto } from './dto/list-payment-schedules.dto'
import { UpdatePaymentScheduleDto } from './dto/update-payment-schedule.dto'
import { PaymentScheduleService } from './payment-schedule.service'

@Controller('staff/payment-schedules')
export class PaymentScheduleController {
  constructor(private readonly paymentScheduleService: PaymentScheduleService) {}

  @Get()
  findAll(@Query() query: ListPaymentSchedulesDto) {
    return this.paymentScheduleService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentScheduleService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreatePaymentScheduleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentScheduleService.create(dto, user.id)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaymentScheduleDto) {
    return this.paymentScheduleService.update(id, dto)
  }

  // 200, not 201: the bill already exists; this changes it (and records its expense).
  @Post(':id/pay')
  @HttpCode(200)
  pay(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentScheduleService.pay(id, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentScheduleService.remove(id)
  }
}
