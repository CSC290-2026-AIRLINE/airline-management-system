// Flights module: the staff routes that hang off one flight (the
// catering order, the stock transfer, the flight report, the sales and
// the resolved cabin settings). They live together so the URLs match
// the Iteration-02 API table.

import { Module } from '@nestjs/common'
import { CabinSettingsModule } from '../cabin-settings/cabin-settings.module'
import { CateringOrdersModule } from '../catering-orders/catering-orders.module'
import { FlightReportModule } from '../flight-report/flight-report.module'
import { SalesModule } from '../sales/sales.module'
import { StockTransfersModule } from '../stock-transfers/stock-transfers.module'
import { FlightsController } from './flights.controller'

@Module({
  imports: [CateringOrdersModule, StockTransfersModule, FlightReportModule, SalesModule, CabinSettingsModule],
  controllers: [FlightsController],
})
export class FlightsModule {}
