import { Controller, Get, Param } from '@nestjs/common'
import { StaffAuth } from '../common/staff-auth.decorator'
import { StockTransfersService } from './stock-transfers.service'

@Controller('staff/stock-transfers')
@StaffAuth()
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get('flight/:flightId')
  async listByFlight(@Param('flightId') flightId: string) {
    return this.transfers.listByFlight(flightId)
  }
}
