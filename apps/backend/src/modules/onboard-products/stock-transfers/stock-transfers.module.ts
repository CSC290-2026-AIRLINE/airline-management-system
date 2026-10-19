// StockTransfers module: move stock from a warehouse to an aircraft
// for a flight. FEFO: each line is satisfied by the earliest-expiring
// batch at the warehouse; we never split a line across batches unless
// the earliest one is short. Two stock_movement rows are written per
// transfer (one from warehouse, one into aircraft).

import { Module } from '@nestjs/common'
import { StockTransfersController } from './stock-transfers.controller'
import { StockTransfersService } from './stock-transfers.service'

@Module({
  controllers: [StockTransfersController],
  providers: [StockTransfersService],
  exports: [StockTransfersService],
})
export class StockTransfersModule {}
