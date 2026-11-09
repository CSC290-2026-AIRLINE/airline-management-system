import { Module } from '@nestjs/common'
import { PaymentEventsController } from './payment-events.controller'
import { PaymentEventsService } from './payment-events.service'

@Module({
  controllers: [PaymentEventsController],
  providers: [PaymentEventsService],
})
export class PaymentEventsModule {}
