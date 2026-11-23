import { Module } from '@nestjs/common'
import { PaymentEventsController } from './payment-events.controller'
import { PaymentEventsService } from './payment-events.service'

@Module({
  controllers: [PaymentEventsController],
  providers: [PaymentEventsService],
  exports: [PaymentEventsService],
})
export class PaymentEventsModule {}
