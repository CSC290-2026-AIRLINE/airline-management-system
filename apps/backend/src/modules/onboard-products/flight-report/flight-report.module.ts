// FlightReport module: per-flight summary submitted at the end of
// the flight. REPORT_MISMATCH if served+sold+wasted+damaged > initial
// for any line. Completion rules: meals are discarded, snacks only
// when the batch is invalid (damaged or expired), beverages kept
// while valid (only damaged rows go), duty-free kept. Closes the
// catering order and fills product_sale.unit_cost on every sale.

import { Module } from '@nestjs/common'
import { FlightReportController } from './flight-report.controller'
import { FlightReportService } from './flight-report.service'
import { SalesModule } from '../sales/sales.module'
import { CateringOrdersModule } from '../catering-orders/catering-orders.module'

@Module({
  imports: [SalesModule, CateringOrdersModule],
  controllers: [FlightReportController],
  providers: [FlightReportService],
  exports: [FlightReportService],
})
export class FlightReportModule {}
