// StockMovements module: read the append-only ledger and accept the
// "Adjust stock" action. Adjustments are signed: a positive quantity
// means the warehouse gained stock (e.g. count correction), negative
// means it lost (e.g. spoilage). The spec's reason vocabulary
// restricts which movements need a reason: spoilage, damage, expired,
// count_correction.

import { Module } from '@nestjs/common'
import { StockMovementsController } from './stock-movements.controller'
import { StockMovementsService } from './stock-movements.service'

@Module({
  controllers: [StockMovementsController],
  providers: [StockMovementsService],
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
