// The stock on an aircraft, by batch.

import { Controller, Get, Param } from '@nestjs/common'
import { StaffAuth } from '../common/staff-auth.decorator'
import { AircraftStockService } from './aircraft-stock.service'

@Controller('staff/aircraft')
@StaffAuth()
export class AircraftStockController {
  constructor(private readonly stock: AircraftStockService) {}

  @Get(':aircraftId/stock')
  async list(@Param('aircraftId') aircraftId: string) {
    return this.stock.list(aircraftId)
  }
}
