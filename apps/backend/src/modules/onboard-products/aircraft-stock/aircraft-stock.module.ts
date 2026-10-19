// AircraftStock module: read-only listing of what is loaded on each
// aircraft. The flight-report service uses this to compute the
// "initial" quantity for each product on a flight. Writes happen
// through stock-transfers (load) and flight-report (discard on submit).

import { Module } from '@nestjs/common'
import { AircraftStockController } from './aircraft-stock.controller'
import { AircraftStockService } from './aircraft-stock.service'

@Module({
  controllers: [AircraftStockController],
  providers: [AircraftStockService],
  exports: [AircraftStockService],
})
export class AircraftStockModule {}
