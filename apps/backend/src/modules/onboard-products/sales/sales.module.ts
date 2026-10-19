// Sales module: per-flight product_sale rows. Created and updated by
// the staff-web after F5 reports paid. unit_cost_amount stays null
// until the flight report is submitted, then is filled from the
// earliest-expiring valid aircraft batch.

import { Module } from '@nestjs/common'
import { SalesController } from './sales.controller'
import { SalesService } from './sales.service'

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
