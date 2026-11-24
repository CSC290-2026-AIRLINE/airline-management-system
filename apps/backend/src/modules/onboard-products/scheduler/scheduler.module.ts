// Scheduler module: the F12 scheduled job (catering order generation,
// order expiry and batch write-off).

import { Module } from '@nestjs/common'
import { CateringOrdersModule } from '../catering-orders/catering-orders.module'
import { ProductOrdersModule } from '../product-orders/product-orders.module'
import { StockBatchesModule } from '../stock-batches/stock-batches.module'
import { SchedulerService } from './scheduler.service'

@Module({
  imports: [CateringOrdersModule, ProductOrdersModule, StockBatchesModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
