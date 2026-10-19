import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { StaffGuard } from '../common/staff.guard'
import { StockTransfersService } from './stock-transfers.service'

@Controller('staff/stock-transfers')
@UseGuards(StaffGuard)
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get('flight/:flightId')
  async listByFlight(@Param('flightId') flightId: string) {
    return this.transfers.listByFlight(flightId)
  }
}
