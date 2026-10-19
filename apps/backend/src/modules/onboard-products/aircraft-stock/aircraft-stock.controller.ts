import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { StaffGuard } from '../common/staff.guard'
import { AircraftStockService } from './aircraft-stock.service'

@Controller('staff/aircraft-stock')
@UseGuards(StaffGuard)
export class AircraftStockController {
  constructor(private readonly stock: AircraftStockService) {}

  @Get(':aircraftId')
  async list(@Param('aircraftId') aircraftId: string) {
    return this.stock.list(aircraftId)
  }
}
