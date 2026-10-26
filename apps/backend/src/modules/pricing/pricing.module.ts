import { Module } from '@nestjs/common'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { PublicSeatFeeController, SeatFeeController } from './seat-fee/seat-fee.controller'
import { SeatFeeService } from './seat-fee/seat-fee.service'

@Module({
  controllers: [FareClassController, SeatFeeController, PublicSeatFeeController],
  providers: [FareClassService, SeatFeeService],
  exports: [FareClassService, SeatFeeService],
})
export class PricingModule {}
