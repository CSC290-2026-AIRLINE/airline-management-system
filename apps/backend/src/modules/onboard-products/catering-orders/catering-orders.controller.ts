import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { CurrentStaff } from '../common/staff.decorator'
import type { StaffContext } from '../common/staff.guard'
import { StaffGuard } from '../common/staff.guard'
import { CateringOrdersService } from './catering-orders.service'

@Controller('staff/catering-orders')
@UseGuards(StaffGuard)
export class CateringOrdersController {
  constructor(private readonly orders: CateringOrdersService) {}

  @Get()
  async list() {
    return this.orders.listOpenAndOrdered()
  }

  @Get('flight/:flightId')
  async get(@Param('flightId') flightId: string) {
    return this.orders.get(flightId)
  }

  // PUT only per the F12 spec.
  @Put('flight/:flightId/refresh')
  async refresh(@Param('flightId') flightId: string, @Body() _body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.orders.refresh(flightId, staff.id)
  }

  @Put('flight/:flightId/load')
  async load(@Param('flightId') flightId: string, @Body() _body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.orders.load(flightId, staff.id)
  }

  @Put('flight/:flightId/close')
  async close(@Param('flightId') flightId: string, @Body() _body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.orders.close(flightId, staff.id)
  }

  @Put('flight/:flightId/void')
  async void(@Param('flightId') flightId: string, @Body() _body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.orders.void(flightId, staff.id)
  }
}
