import { Module } from '@nestjs/common'
import { CabinSettingsModule } from '../cabin-settings/cabin-settings.module'
import { PaymentEventsModule } from '../payment-events/payment-events.module'
import { ProductOrdersController } from './product-orders.controller'
import { ProductOrdersService } from './product-orders.service'

@Module({
  imports: [CabinSettingsModule, PaymentEventsModule],
  controllers: [ProductOrdersController],
  providers: [ProductOrdersService],
  exports: [ProductOrdersService],
})
export class ProductOrdersModule {}
