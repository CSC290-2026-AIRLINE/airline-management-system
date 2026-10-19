// PurchaseReceipts module: "Receive delivery" flow. Each receipt
// creates one stock_batch per line and upserts the warehouse_stock
// roll-up. The whole transaction is atomic; the receipt row is
// stamped with the receiving staff member for audit.

import { Module } from '@nestjs/common'
import { PurchaseReceiptsController } from './purchase-receipts.controller'
import { PurchaseReceiptsService } from './purchase-receipts.service'

@Module({
  controllers: [PurchaseReceiptsController],
  providers: [PurchaseReceiptsService],
  exports: [PurchaseReceiptsService],
})
export class PurchaseReceiptsModule {}
