// StockBatches module: read-only listing of batches per warehouse /
// product, plus the manual write-off action for expired batches. The
// create side lives inside purchase-receipts (each line = one batch).

import { Module } from '@nestjs/common'
import { StockBatchesController } from './stock-batches.controller'
import { StockBatchesService } from './stock-batches.service'

@Module({
  controllers: [StockBatchesController],
  providers: [StockBatchesService],
  exports: [StockBatchesService],
})
export class StockBatchesModule {}
