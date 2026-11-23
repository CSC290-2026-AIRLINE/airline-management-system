import { Module } from '@nestjs/common'
import { CabinSettingsModule } from '../cabin-settings/cabin-settings.module'
import { ProductOrdersController } from './product-orders.controller'
import { ProductOrdersService } from './product-orders.service'

@Module({
  imports: [CabinSettingsModule],
  controllers: [ProductOrdersController],
  providers: [ProductOrdersService],
  exports: [ProductOrdersService],
})
export class ProductOrdersModule {}
