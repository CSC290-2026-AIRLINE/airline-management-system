// WarehouseStock module: the stock of a warehouse, per product.

import { Module } from '@nestjs/common'
import { WarehouseStockController } from './warehouse-stock.controller'
import { WarehouseStockService } from './warehouse-stock.service'

@Module({
  controllers: [WarehouseStockController],
  providers: [WarehouseStockService],
  exports: [WarehouseStockService],
})
export class WarehouseStockModule {}
