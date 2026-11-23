// CateringOrders module: per-flight catering order. One row per
// flight (unique on flight_id). The flow is: refresh (generate from
// current settings + stock), load (transfer to aircraft), close (end
// of flight). Voiding is only allowed before the catering has been
// loaded; once loaded the catering order can only be closed.

import { Module } from '@nestjs/common'
import { CateringOrdersController } from './catering-orders.controller'
import { CateringOrdersService } from './catering-orders.service'
import { StockTransfersModule } from '../stock-transfers/stock-transfers.module'
import { CabinSettingsModule } from '../cabin-settings/cabin-settings.module'

@Module({
  imports: [StockTransfersModule, CabinSettingsModule],
  controllers: [CateringOrdersController],
  providers: [CateringOrdersService],
  exports: [CateringOrdersService],
})
export class CateringOrdersModule {}
